---
phase: 03-ai-intelligence
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/generate-model.py
  - src/background/ai-learning.ts
  - src/background/classifier.ts
  - src/background/hibernation.ts
  - src/background/idb.ts
  - src/background/index.ts
  - src/dashboard/App.tsx
  - src/offscreen/main.ts
  - src/popup/App.tsx
  - src/shared/constants.ts
  - src/shared/types.ts
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
  fixed: 6
  remaining: 2
status: clean
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This review covers the Phase 3 AI Intelligence implementation: ORT-Web inference via an Offscreen Document, behavioral history collection in IDB, per-domain bias learning, and classification-driven hibernation multipliers. The overall architecture is sound. Three blockers were found: the ORT session is permanently unusable after the first init failure; the wake-misclassification signal is dead code due to a Chrome `onUpdated` event ordering constraint; and the IDB `blocking()` handler does not actually close the database connection. Three warnings cover unbounded IDB tab-history growth, missing empty-domain validation on the KEEP_ALIVE path, and an unsafe `as any` cast.

---

## Critical Issues

### CR-01: ORT session permanently broken after first initialization failure

**File:** `src/offscreen/main.ts:22-48`

**Issue:** `getSession()` stores the IIFE promise in `sessionInit` before awaiting it. If that promise rejects (e.g., `fetch` fails for the `.onnx` model, or `InferenceSession.create` throws), `sessionInit` is left pointing to a **rejected** `Promise<void>` — it is never reset to `null`. Every subsequent call to `getSession()` falls into the `else { await sessionInit }` branch and immediately rethrows the same rejection. The ORT session is permanently dead for the lifetime of the Offscreen Document, silently disabling all AI classification.

```typescript
// Broken path (abbreviated):
if (!sessionInit) {
  sessionInit = (async () => { /* may throw */ })()
  await sessionInit   // <-- throws here on failure
  sessionInit = null  // <-- never reached
} else {
  await sessionInit   // <-- subsequent callers rethrow forever
}
```

**Fix:** Reset `sessionInit = null` in the rejection path so the next call retries:

```typescript
if (!sessionInit) {
  sessionInit = (async () => {
    ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')
    ort.env.wasm.numThreads = 1
    const modelUrl = chrome.runtime.getURL('src/assets/classifier.onnx')
    const modelBuffer = await fetch(modelUrl).then((r) => r.arrayBuffer())
    const webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator
    const eps = webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm']
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: eps,
    })
  })()
  try {
    await sessionInit
  } finally {
    sessionInit = null  // always reset so next call can retry
  }
} else {
  await sessionInit
}
```

---

### CR-02: Wake-misclassification signal is dead code — the condition can never be true

**File:** `src/background/index.ts:100-131`

**Issue:** The `onUpdated` listener returns early at line 103 (`if (changeInfo.status !== 'complete') return`). Chrome fires tab update events with one set of changed properties per event. When a discarded tab is woken, Chrome emits **two separate events**:

1. `{ status: 'loading', discarded: false }` — `discarded` transitions here; this event hits the early return on line 103.
2. `{ status: 'complete' }` — `discarded` is **absent** from `changeInfo` in this event (Chrome only includes properties that changed in that specific event).

Therefore `changeInfo.discarded === false` is `undefined === false` → `false` at the point where `status === 'complete'`. The entire wake-misclassification block (lines 113-130) is unreachable. `recordWakeMisclassification` is never called from production code, making the implicit learning signal (D-09) non-functional.

**Fix:** Move the wake-signal logic into a separate event check that does **not** require `status === 'complete'`:

```typescript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Phase 3: wake signal — fires on the event where discarded transitions to false
  // This is separate from the status=complete guard below.
  if (changeInfo.discarded === false && tab.url) {
    chrome.storage.local.get('ai_classifications', (r) => {
      const cache = (r['ai_classifications'] as Record<number, ClassificationResult>) ?? {}
      const cached = cache[tabId]
      if (
        cached?.label &&
        cached.confidence >= AI_CONFIDENCE_THRESHOLD &&
        Date.now() - cached.cachedAt < AI_WAKE_SIGNAL_WINDOW_MS
      ) {
        try {
          const domain = new URL(tab.url!).hostname
          if (domain) recordWakeMisclassification(domain).catch(() => {})
        } catch { /* skip */ }
      }
    })
  }

  // Thumbnail capture — only when page is fully loaded and active
  if (changeInfo.status !== 'complete') return
  if (!tab.active) return
  if (!tab.url?.startsWith('http')) return
  captureAndStore(tabId, tab.url, tab.windowId).catch((err) =>
    console.error('[smart-hibernator] thumbnail capture failed', err)
  )
})
```

---

### CR-03: IDB `blocking()` handler does not close the database connection

**File:** `src/background/idb.ts:52-55`

**Issue:** The `blocking()` callback is fired when this context holds an open IDB connection that is preventing another context (e.g. an extension update in a second tab) from upgrading the database. The intent of the comment is correct ("close our connection"), but `dbPromise = null` only clears the JavaScript reference — it does **not** close the underlying `IDBDatabase` connection. The upgrade in the other context remains blocked indefinitely, causing the extension to malfunction in multi-context scenarios (two popup windows open, dashboard + popup open simultaneously during an update).

According to the idb@8 library source (`node_modules/idb/build/index.js:184-185`), `blocking()` is fired as a `versionchange` event handler on `db`. The `event` object received by the callback exposes `event.target` which is the `IDBDatabase` instance.

**Fix:**

```typescript
blocking(currentVersion, blockedVersion, event) {
  // Nullify our cached promise so next getDb() call re-opens
  dbPromise = null
  // Actually close the connection so the other context's upgrade can proceed
  ;(event.target as IDBDatabase).close()
},
```

---

## Warnings

### WR-01: Tab-history IDB store grows unboundedly — `pruneTabHistory` is never called in production

**File:** `src/background/idb.ts:135` / `src/background/index.ts` (caller absent)

**Issue:** `pruneTabHistory(cutoff)` is exported and tested but is **never invoked from production code**. The 14-day rolling window is enforced at read time (`getTabHistoryByDomain` filters `timestamp >= since`) but rows are never deleted. Over weeks of use the `tab-history` store will accumulate every visit record indefinitely, increasing IDB storage consumption and slowing index scans.

**Fix:** Call `pruneTabHistory` on each alarm tick (or less frequently, e.g. every N ticks) inside `handleAlarmTick` in `hibernation.ts`:

```typescript
// In handleAlarmTick, after classifyBatch:
import { pruneTabHistory } from './idb'
import { AI_HISTORY_WINDOW_MS } from '../shared/constants'

// Prune tab-history rows outside the 14-day window (best-effort)
try {
  await pruneTabHistory(Date.now() - AI_HISTORY_WINDOW_MS)
} catch { /* silently continue */ }
```

---

### WR-02: Empty-string domain passes `KEEP_ALIVE` validation and is written to IDB

**File:** `src/background/index.ts:173-179`

**Issue:** The KEEP_ALIVE validation on line 176 checks `message.domain.length < 256` but does **not** check for empty string (`length > 0`). When `handleKeepAlive` in the popup is called with `tab.domain === ''` (which can happen when `new URL(tab.url).hostname` fails — see `src/popup/App.tsx:96`), an empty string is sent to the service worker. The SW accepts it (length 0 < 256), and `recordKeepAlive('', tabId)` writes a `DomainBiasRecord` with `domain: ''` to the `domain-bias` IDB store. This entry can never match any real tab's domain, is never cleaned up, and represents a minor IDB pollution / logic error.

**Fix:** Add a minimum length check:

```typescript
if (
  message.type === 'KEEP_ALIVE' &&
  typeof message.tabId === 'number' &&
  typeof message.domain === 'string' &&
  message.domain.length > 0 &&       // <-- add this guard
  message.domain.length < 256
) {
```

---

### WR-03: `(navigator as any).gpu` — unsafe type erasure for WebGPU probe

**File:** `src/offscreen/main.ts:35`

**Issue:** `(navigator as any).gpu` casts away all type safety to access the WebGPU `navigator.gpu` property. If the WebGPU type definitions are available (they are in `@webgpu/types` and in recent TypeScript lib versions), this should use a proper type guard. The `as any` cast would silently hide any future type mismatch.

**Fix:** Use the `'gpu' in navigator` operator which is already present in the same expression, and read the property without casting:

```typescript
const webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator
// Remove the `!!(navigator as any).gpu` access entirely; `'gpu' in navigator` is sufficient
```

---

## Info

### IN-01: `pruneTabHistory` cursor loop does not call `tx.done` on early IDB errors

**File:** `src/background/idb.ts:135-145`

**Issue:** `pruneTabHistory` opens a readwrite transaction and iterates a cursor. If `cursor.delete()` or `cursor.continue()` throws mid-loop, `await tx.done` is never reached. The transaction will eventually time out via IDB's internal mechanism, but the function call will silently hang until then. This is a minor robustness gap.

**Fix:** Wrap the cursor loop in try/finally:

```typescript
export async function pruneTabHistory(cutoff: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('tab-history', 'readwrite')
  try {
    const index = tx.store.index('by-timestamp')
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
  } finally {
    await tx.done
  }
}
```

---

### IN-02: `TIMEOUT_MS` constant is exported but superseded — dead export

**File:** `src/shared/constants.ts:2`

**Issue:** `TIMEOUT_MS` is defined and exported but is no longer used anywhere in production code — `hibernation.ts` reads `timeout_minutes` from storage and computes `timeoutMs` inline. The constant remains as an exported symbol, which could mislead future contributors into thinking it is the canonical timeout value.

**Fix:** Remove the export or replace with a comment marking it as deprecated:

```typescript
// TIMEOUT_MS removed — runtime reads `timeout_minutes` from storage (Phase 2+).
```

---

_Reviewed: 2026-05-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
