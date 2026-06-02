# Phase 4: Perfect State Restoration - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/content/form-watcher.ts` | content-script (extend) | event-driven + request-response | `src/content/form-watcher.ts` (self — current state) | exact |
| `src/content/form-watcher.test.ts` | test (create) | — | `src/background/thumbnail.test.ts` + `src/background/idb.test.ts` | role-match |
| `src/background/idb.ts` | service / data-layer (extend) | CRUD | `src/background/idb.ts` (self — v2→v3 upgrade section) | exact |
| `src/background/index.ts` | service-worker / router (extend) | event-driven + request-response | `src/background/index.ts` (self — FORM_ACTIVITY + KEEP_ALIVE blocks) | exact |
| `src/shared/types.ts` | model (extend) | — | `src/shared/types.ts` (self — `TabHistoryRecord` / `DomainBiasRecord` section) | exact |
| `manifest.json` | config (verify only) | — | `manifest.json` (self) | exact — no changes expected |

---

## Pattern Assignments

### `src/content/form-watcher.ts` (content-script, event-driven + request-response)

**Analog:** `src/content/form-watcher.ts` (current file — Phase 4 extends it in-place)

The existing file is 23 lines. Phase 4 adds debounced capture, flush, and the GET_STATE restore path alongside the existing `FORM_ACTIVITY` logic. All patterns below are from the current file or its established conventions.

**Existing import / structure pattern** (lines 1-23, full file):
```typescript
// No imports — content script uses only browser globals (chrome.runtime, DOM APIs)
// Top-level constants before any function definitions
const WATCHED_SELECTORS = 'input, textarea, select'

function reportFormActivity(): void {
  chrome.runtime.sendMessage({
    type: 'FORM_ACTIVITY',
    timestamp: Date.now(),
  }).catch(() => {
    // SW may be starting up; message is best-effort
  })
}
```

**Established conventions to follow:**
- Message type names follow `SCREAMING_SNAKE_CASE` string literals: `'FORM_ACTIVITY'`, `'KEEP_ALIVE'` — new messages must be `'SAVE_STATE'` and `'GET_STATE'`.
- `chrome.runtime.sendMessage(…).catch(() => {})` — all fire-and-forget sends swallow errors (SW may be sleeping). SAVE_STATE sends (debounced + flush) must use this pattern.
- No imports — content scripts are standalone globals-only files in this project.
- Event listeners registered at top level (module scope), not inside functions.

**sendMessage fire-and-forget pattern** (line 4-9):
```typescript
chrome.runtime.sendMessage({
  type: 'FORM_ACTIVITY',
  timestamp: Date.now(),
}).catch(() => {
  // SW may be starting up; message is best-effort
})
```

**sendMessage request-response pattern** (new for GET_STATE — follows Chrome messaging docs, Chrome 120 compat):
```typescript
// GET_STATE requires a response — use callback overload, not Promise API,
// to avoid the async-handler-returns-Promise pitfall on Chrome < 148.
chrome.runtime.sendMessage({ type: 'GET_STATE', url: location.href }, (snapshot) => {
  if (chrome.runtime.lastError) return   // SW not ready — skip restore
  if (!snapshot) return                  // no stored state for this tab
  startRestore(snapshot)
})
```

**Debounce pattern** (from RESEARCH.md Pattern 3 — standard, no analog in codebase yet):
```typescript
const DEBOUNCE_MS = 500   // import from shared/constants once added
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCapture(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS)
}

window.addEventListener('scroll', scheduleCapture, { passive: true })
document.addEventListener('input', scheduleCapture, { passive: true })
document.addEventListener('change', scheduleCapture, { passive: true })
```

**Flush on visibility events** (new — pagehide + visibilitychange):
```typescript
window.addEventListener('pagehide', () => {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  sendSnapshot()   // best-effort; SW may be starting up — .catch(() => {}) inside sendSnapshot
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    sendSnapshot()
  }
})
```

**MutationObserver bounded restore** (from RESEARCH.md Pattern 4):
```typescript
const RESTORE_CAP_MS = 550   // import from shared/constants once added

function startRestore(snapshot: TabStateSnapshot): void {
  history.scrollRestoration = 'manual'   // only set when snapshot found (Pitfall 7)
  applyState(snapshot)

  const capTimer = setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)
  const observer = new MutationObserver(() => {
    applyState(snapshot)
    if (allFieldsResolved(snapshot)) {
      clearTimeout(capTimer)
      observer.disconnect()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
```

---

### `src/content/form-watcher.test.ts` (test, new file)

**Primary analog:** `src/background/thumbnail.test.ts` (service-layer unit test with mocked deps)
**Secondary analog:** `src/background/idb.test.ts` (real IDB CRUD tests with fake-indexeddb) and `src/background/index.test.ts` (vi.hoisted + vi.mock + callListeners patterns)

**File-level structure pattern** — from `src/background/thumbnail.test.ts` lines 1-9:
```typescript
// Covers FR-11 scroll+form capture/restore and FR-12 timing contract (Phase 4)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// ... import functions under test from './form-watcher'

// Mock dependencies (chrome.runtime is provided by vitest-chrome in vitest.setup.ts)
vi.mock('./idb', () => ({   // only if form-watcher ever imports idb — it should NOT
  // content script must not open IDB directly (Phase 3 invariant)
}))
```

**vi.hoisted mock pattern** — from `src/background/index.test.ts` lines 5-14:
```typescript
const { recordKeepAliveMock } = vi.hoisted(() => ({
  recordKeepAliveMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./ai-learning', () => ({
  recordKeepAlive: recordKeepAliveMock,
  // ...
}))
```
Apply the same `vi.hoisted` pattern for any mocks of `chrome.runtime.sendMessage` that need per-test reconfiguration.

**beforeEach / afterEach pattern** — fake timers required for FR-12 (from RESEARCH.md Q6 + Pitfall 4):
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  // CRITICAL: performance.now() is not faked by default — must opt-in explicitly
  // See: github.com/vitest-dev/vitest/issues/9352
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})
```

**Wave 0 infrastructure check pattern** — from `src/background/thumbnail.test.ts` line 17 and `src/background/idb.test.ts` line 58:
```typescript
it('Wave 0 infrastructure check: DEBOUNCE_MS and RESTORE_CAP_MS constants are defined', () => {
  // Verifies shared/constants exports before any behavior tests
  expect(DEBOUNCE_MS).toBe(500)
  expect(RESTORE_CAP_MS).toBe(550)
})
```

**describe block structure** — from `src/background/idb.test.ts` lines 57-175 (three separate `describe` blocks per feature area):
```typescript
describe('captureState (FR-11 — capture)', () => { /* ... */ })
describe('shouldCapture exclusions (FR-11 D-03)', () => { /* ... */ })
describe('resolveField matching (FR-11 D-04)', () => { /* ... */ })
describe('startRestore / MutationObserver cap (FR-12)', () => { /* ... */ })
```

**chrome.runtime.sendMessage mock for GET_STATE response** — the callback-based overload must be mocked:
```typescript
// In test setup:
vi.mocked(chrome.runtime.sendMessage).mockImplementation(
  (_msg: unknown, callback?: (response: unknown) => void) => {
    callback?.(null)   // null = no snapshot
    return Promise.resolve()
  }
)
```

**Observer disconnect assertion** — FR-12 cap:
```typescript
it('MutationObserver disconnects within RESTORE_CAP_MS when cap expires', () => {
  const disconnectSpy = vi.fn()
  // stub MutationObserver with disconnect spy
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect = disconnectSpy
    constructor(public cb: MutationObserverCallback) {}
  })
  startRestore(makeSnapshot())
  vi.advanceTimersByTime(550)
  expect(disconnectSpy).toHaveBeenCalled()
})
```

---

### `src/background/idb.ts` (service/data-layer, CRUD, extend)

**Analog:** `src/background/idb.ts` itself — the v1→v2 upgrade block (lines 36-48) is the direct pattern to copy for the v2→v3 bump.

**Version bump pattern** (lines 35, 37-48 — copy and extend):
```typescript
// BEFORE (v2):
dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) { /* thumbnails */ }
    if (oldVersion < 2) { /* tab-history, domain-bias */ }
  },

// AFTER (v3 — add this block; do NOT touch oldVersion < 1 or < 2):
dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) { /* unchanged */ }
    if (oldVersion < 2) { /* unchanged */ }
    if (oldVersion < 3) {
      db.createObjectStore('tab-state', { keyPath: 'tabId' })
    }
  },
```

**blocked/blocking handlers** (lines 49-59 — preserve verbatim, including CR-03 fix):
```typescript
blocked() {
  console.warn('[smart-hibernator] IDB upgrade blocked — close other extension tabs')
},
blocking(_currentVersion, _blockedVersion, event) {
  dbPromise = null
  // CR-03: must close the underlying connection, not just null the promise
  ;(event.target as IDBDatabase).close()
},
```

**DB interface extension** (lines 15-29 — add `'tab-state'` entry):
```typescript
interface SmartHibernatorDB {
  thumbnails: { key: number; value: ThumbnailRecord }
  'tab-history': { key: number; value: TabHistoryRecord; indexes: { 'by-domain': string; 'by-timestamp': number } }
  'domain-bias': { key: string; value: DomainBiasRecord }
  'tab-state': { key: number; value: TabStateSnapshot }   // Phase 4 — keyed by tabId
}
```

**CRUD function pattern** — from `thumbnail` store functions (lines 67-85):
```typescript
export async function putTabState(record: TabStateSnapshot): Promise<void> {
  const db = await getDb()
  await db.put('tab-state', record)
}

export async function getTabState(tabId: number): Promise<TabStateSnapshot | undefined> {
  const db = await getDb()
  return db.get('tab-state', tabId)
}

export async function deleteTabState(tabId: number): Promise<void> {
  const db = await getDb()
  await db.delete('tab-state', tabId)
}
```

**Import addition** — add `TabStateSnapshot` to the import from `../shared/types` (line 6):
```typescript
import type { TabHistoryRecord, DomainBiasRecord, TabStateSnapshot } from '../shared/types'
```

---

### `src/background/index.ts` (service-worker router, event-driven + request-response, extend)

**Analog:** `src/background/index.ts` itself — existing message handler blocks and `onRemoved` listener.

**Import addition** (lines 9-11 — add new idb exports to existing import):
```typescript
// BEFORE:
import { deleteThumbnail } from './idb'

// AFTER — add putTabState, getTabState, deleteTabState:
import { deleteThumbnail, putTabState, getTabState, deleteTabState } from './idb'
```

**FORM_ACTIVITY handler pattern** (lines 151-159) — copy structure for SAVE_STATE:
```typescript
// FORM_ACTIVITY (existing — copy structure):
if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) {
  const tabId = sender.tab.id
  chrome.storage.local.get('tab_meta', (result) => { /* ... */ })
  return   // synchronous handler — no sendResponse needed
}

// SAVE_STATE (new — same sync handler shape, writes to IDB via putTabState):
if (message.type === 'SAVE_STATE' && sender.tab?.id) {
  const tabId = sender.tab.id
  const snapshot: TabStateSnapshot = {
    tabId,
    url: message.url as string,
    scroll: message.scroll as { x: number; y: number },
    fields: message.fields as FieldSnapshot[],
    capturedAt: Date.now(),
  }
  putTabState(snapshot).catch(() => {})
  return   // fire-and-forget; no sendResponse
}
```

**Async sendResponse pattern** — for GET_STATE, copy shape from KEEP_ALIVE (lines 173-181) but add `return true` (CRITICAL for Chrome 120 compat):
```typescript
// KEEP_ALIVE (existing — sync, no return true needed):
if (message.type === 'KEEP_ALIVE' && /* validation */) {
  recordKeepAlive(…).catch(() => {})
  return
}

// GET_STATE (new — async sendResponse requires return true):
if (message.type === 'GET_STATE' && sender.tab?.id) {
  const tabId = sender.tab.id
  const url = message.url as string
  getTabState(tabId).then((snapshot) => {
    if (!snapshot || snapshot.url !== url) {
      sendResponse(null)
      return
    }
    deleteTabState(tabId).catch(() => {})   // D-06 delete-after-restore
    sendResponse(snapshot)
  }).catch(() => sendResponse(null))
  return true   // CRITICAL: keeps message channel open for async sendResponse
}
```

**onRemoved eviction pattern** (lines 133-148) — add deleteTabState call alongside existing deleteThumbnail:
```typescript
chrome.tabs.onRemoved.addListener((tabId) => {
  // ... existing tab_meta cleanup ...
  deleteThumbnail(tabId).catch(() => { /* silently ignore */ })
  deleteTabState(tabId).catch(() => {})   // Phase 4: D-06 eviction on tab close

  closeTabVisit(tabId, false).catch(() => {})
  if (tabId === lastActiveTabId) { lastActiveTabId = null }
})
```

**sender.tab?.id guard pattern** (line 151) — all new message handlers must guard the same way:
```typescript
if (message.type === 'NEW_TYPE' && sender.tab?.id) {
  // sender.tab.id is the canonical way to get tabId from a content-script message
```

---

### `src/shared/types.ts` (model, extend)

**Analog:** `src/shared/types.ts` itself — `TabHistoryRecord` (lines 22-31) and `DomainBiasRecord` (lines 33-39) show the interface style.

**Existing interface pattern** (lines 22-31):
```typescript
export interface TabHistoryRecord {
  id?: number           // optional auto-increment key
  domain: string
  url: string
  visitStart: number
  visitEnd: number
  dwellMs: number
  hadFormActivity: boolean
  timestamp: number
}
```

**New interfaces to add** — follow the same field ordering convention (key field first, then strings, then numbers, then optionals):
```typescript
// Phase 4 — State Restoration (FR-11)

export interface FieldSnapshot {
  id?: string              // element.id if present
  name?: string            // element.name if present
  selectorPath?: string    // nth-child CSS path fallback (D-04)
  value: string            // serialized value (checkbox: 'true'/'false')
  type: string             // e.g. 'input[text]', 'textarea', 'select'
}

export interface TabStateSnapshot {
  tabId: number            // IDB key (keyPath)
  url: string              // D-06: URL match guard
  scroll: { x: number; y: number }
  fields: FieldSnapshot[]
  capturedAt: number
}
```

**Where to insert** — after the existing `DomainBiasRecord` interface (line 39), before `StorageSchema` (line 41). Follow the `// Phase N —` comment convention already used in the file (e.g., lines 13, 47, 49).

---

### `manifest.json` (config, verify only)

**No changes expected.** All required capabilities are already present:

| Requirement | Manifest Entry | Status |
|---|---|---|
| Content script on all URLs at document_idle | `content_scripts[0]` — `<all_urls>`, `document_idle`, `form-watcher.ts` | Already correct |
| Storage permission | `permissions: ["storage"]` | Already present |
| Tabs permission | `permissions: ["tabs"]` | Already present |
| Scripting permission | `permissions: ["scripting"]` | Already present |

Planner should verify the content_scripts entry at lines 19-24 but should NOT modify manifest.json for Phase 4.

---

## Shared Patterns

### Pattern A: fire-and-forget sendMessage (content script → SW)
**Source:** `src/content/form-watcher.ts` lines 4-9
**Apply to:** All SAVE_STATE sends (debounced and flush) in form-watcher.ts
```typescript
chrome.runtime.sendMessage({ type: 'SAVE_STATE', /* ... */ }).catch(() => {
  // SW may be starting up; message is best-effort
})
```

### Pattern B: sender.tab?.id guard in SW message handler
**Source:** `src/background/index.ts` line 151
**Apply to:** SAVE_STATE handler, GET_STATE handler in index.ts
```typescript
if (message.type === 'SAVE_STATE' && sender.tab?.id) {
  const tabId = sender.tab.id  // safe: sender.tab is non-null
  // ...
}
```

### Pattern C: async sendResponse with `return true`
**Source:** Chrome messaging docs (no existing codebase example — this is the first async-response handler in the project)
**Apply to:** GET_STATE handler in index.ts
**Critical:** The handler function signature is `(message, sender, sendResponse)` — it is NOT declared `async`. The `.then()/.catch()` chain calls `sendResponse` and the handler body returns `true` (literal boolean) to keep the port open. An `async` handler would return a Promise, which is not supported on Chrome 120 (COMP-01).
```typescript
// CORRECT pattern:
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE' && sender.tab?.id) {
    getTabState(sender.tab.id).then((snapshot) => {
      sendResponse(snapshot ?? null)
    }).catch(() => sendResponse(null))
    return true  // <-- literal true, not "return somePromise"
  }
  // ... other handlers return nothing (undefined) or false
})

// WRONG — do NOT write:
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // async handler cannot return true — it returns a Promise
})
```

### Pattern D: vi.hoisted + vi.mock for idb in SW tests
**Source:** `src/background/index.test.ts` lines 5-41
**Apply to:** Any new describe blocks added to index.test.ts for SAVE_STATE, GET_STATE, onRemoved tests
```typescript
// Add to existing vi.mock('./idb', ...) factory (line 35-41):
vi.mock('./idb', () => ({
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
  appendTabHistory: vi.fn().mockResolvedValue(undefined),
  getDomainBias: vi.fn().mockResolvedValue(undefined),
  putDomainBias: vi.fn().mockResolvedValue(undefined),
  countTabHistory: vi.fn().mockResolvedValue(0),
  // Phase 4 — add:
  putTabState: vi.fn().mockResolvedValue(undefined),
  getTabState: vi.fn().mockResolvedValue(undefined),
  deleteTabState: vi.fn().mockResolvedValue(undefined),
}))
```

### Pattern E: callListeners to trigger SW event handlers in tests
**Source:** `src/background/index.test.ts` lines 126, 141
**Apply to:** SAVE_STATE and GET_STATE handler tests, onRemoved eviction test
```typescript
// Trigger onMessage with a fake sender that has tab.id:
chrome.runtime.onMessage.callListeners(
  { type: 'SAVE_STATE', url: 'https://example.com', scroll: { x: 0, y: 200 }, fields: [] },
  { tab: { id: 42 } } as chrome.runtime.MessageSender,
  vi.fn()   // sendResponse spy
)

// Trigger onRemoved:
chrome.tabs.onRemoved.callListeners(42, { isWindowClosing: false, windowId: 1 })
```

### Pattern F: fake-indexeddb black-box CRUD test pattern
**Source:** `src/background/idb.test.ts` lines 57-102 (thumbnails describe block)
**Apply to:** New `tab-state CRUD (FR-11)` describe block in idb.test.ts
```typescript
// Factory helper — same pattern as makeThumbnail / makeHistoryRecord:
function makeStateSnapshot(overrides: Partial<TabStateSnapshot> = {}): TabStateSnapshot {
  return {
    tabId: 1,
    url: 'https://example.com',
    scroll: { x: 0, y: 100 },
    fields: [],
    capturedAt: Date.now(),
    ...overrides,
  }
}

describe('tab-state CRUD (FR-11)', () => {
  it('putTabState stores a record retrievable by getTabState', async () => { /* ... */ })
  it('getTabState returns undefined for unknown tabId', async () => { /* ... */ })
  it('deleteTabState removes the entry', async () => { /* ... */ })
})
```

### Pattern G: constants naming and placement
**Source:** `src/shared/constants.ts` — existing naming conventions
**Apply to:** New constants `DEBOUNCE_MS`, `RESTORE_CAP_MS`, `MAX_FIELDS`, `MAX_FIELD_VALUE_LEN`
```typescript
// Phase 4 — State Restoration constants
export const DEBOUNCE_MS = 500              // D-01: scroll/input debounce interval
export const RESTORE_CAP_MS = 550          // D-07: MutationObserver cap (50ms under FR-12 600ms budget)
export const MAX_FIELDS = 50               // Pitfall 6: field count cap per snapshot
export const MAX_FIELD_VALUE_LEN = 10_000  // Pitfall 6: per-field value length cap (chars)
```

---

## No Analog Found

All Phase 4 files have close analogs in the existing codebase. No files require falling back to RESEARCH.md-only patterns.

The closest gap is the **callback-based GET_STATE sendMessage** in the content script — the existing project uses only fire-and-forget `.catch(() => {})` sends and never request-response. The pattern is well-documented in RESEARCH.md Pattern 2 and the Chrome messaging docs; the planner should reference those directly for the content-script-side `sendMessage(msg, callback)` call.

---

## Metadata

**Analog search scope:** `src/content/`, `src/background/`, `src/shared/`, `manifest.json`, `vitest.setup.ts`, `vitest.config.ts`
**Files read:** 13 source files + 2 planning docs
**Pattern extraction date:** 2026-06-02
