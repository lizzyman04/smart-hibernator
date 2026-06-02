# Phase 4: Perfect State Restoration - Research

**Researched:** 2026-06-02
**Domain:** Chrome MV3 content script lifecycle, IndexedDB v3 upgrade, scroll/form state capture and restore, MutationObserver bounded retry
**Confidence:** MEDIUM-HIGH (core Chrome behaviors ASSUMED from tab-discard blog; IDB/messaging patterns HIGH from code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Continuous, debounced capture. Scroll and input/change events debounced ~500ms. Final flush on `pagehide` and `visibilitychange→hidden`. No just-in-time capture before discard.
- **D-02:** Rely on native `sessionStorage` survival across discard/reload. Capture only scroll + form field values — not sessionStorage itself.
- **D-03:** Exclude `type="password"`, `type="hidden"`, `type="file"`, and `autocomplete` values `cc-*`, `one-time-code`, `new-password`. Capture text/textarea/select/checkbox/radio.
- **D-04:** Field matching: `id` → `name` → computed CSS-selector-path fallback. Skip unresolved fields silently.
- **D-05:** Store in existing `smart-hibernator` IndexedDB, new object store, keyed by tabId. SW owns all IDB writes; content script messages SW.
- **D-06:** Store URL alongside snapshot. Restore only on URL match. Delete after restore and on `chrome.tabs.onRemoved`.
- **D-07:** MutationObserver + bounded retry, ~600ms cap total, then disconnect.
- **D-08:** Content script pulls snapshot from SW via `GET_STATE { tabId, url }` at document_idle. SW returns snapshot or null.

### Claude's Discretion

- Exact debounce constant (D-01 ~500ms).
- Exact observer cap constant (D-07 ~600ms total).
- New IDB object-store name and record shape (must include tabId, url, scroll, fields[], capturedAt).
- How content script discovers its tabId (SW supplies it in the GET_STATE response, keyed from `sender.tab.id`).
- Scroll capture granularity: window scroll minimum; inner scroll containers discretionary.
- How FR-12 is measured/asserted in tests.
- Whether to set `history.scrollRestoration = 'manual'`.
- Exact message type names for new messages (follow FORM_ACTIVITY convention).

### Deferred Ideas (OUT OF SCOPE)

- iframe / cross-origin subframe state capture.
- Scrollable sub-container restoration (window/document scroll is the required minimum).
- Cross-session state survival.
- Just-in-time / hybrid capture before discard.
- Explicit sessionStorage snapshotting.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-11 | Content scripts must capture and restore scroll position, form data, and SPA state (via sessionStorage). | Capture: debounced events in form-watcher.ts extension; store in new IDB store via SW. Restore: GET_STATE → MutationObserver loop in content script at document_idle. |
| FR-12 | Restoration must complete in < 600ms upon tab activation. | MutationObserver bounded disconnect + performance.now span. Test with vi.useFakeTimers({ toFake: ['performance'] }) + vi.advanceTimersByTime(). |
</phase_requirements>

---

## Summary

Phase 4 extends the existing content-script/SW messaging infrastructure (established in Phases 1–3) to capture and restore scroll position and form field values across the native `chrome.tabs.discard()` cycle. The extension already has everything it needs: `src/content/form-watcher.ts` is injected on `<all_urls>` at `document_idle`, the SW handles messages from it, and `src/background/idb.ts` provides a v2 database with the `blocked`/`blocking` handlers already in place. Phase 4 adds a new v3 object store (`tab-state`), extends form-watcher.ts with debounced capture + flush + restore logic, and adds `GET_STATE` / `SAVE_STATE` message handlers to the SW.

The most important architectural insight is the **tab lifecycle sequence on wake**: when a discarded tab is activated, Chrome reloads the page normally — the content script re-injects at `document_idle` exactly as it does on first load. This means D-08 (content-script pull-on-load) is the natural fit. The SW never needs to push; the content script simply asks for its snapshot on every load and applies it when one is found. The `document.wasDiscarded` flag is available in the page context to detect restores, but D-08 makes it unnecessary — the GET_STATE response is `null` for non-restored tabs and non-null for restored ones.

The critical open question around **sessionStorage survival** is partially resolved: Chrome's own Tab Discarding blog explicitly states form content and scroll position are preserved via the same mechanism as history navigation. However, the Page Lifecycle spec and MDN are inconsistent — the spec says session storage "can be discarded" and no events fire on discard. D-02's claim (sessionStorage survives) is **ASSUMED** to be correct based on Chrome's Tab Discarding blog and widely-reported developer experience, but was not conclusively verified in an authoritative specification. This is low-risk because Phase 4 captures scroll + form explicitly regardless — sessionStorage survival is a bonus, not a dependency.

**Primary recommendation:** Implement exactly as the locked decisions specify. Extend form-watcher.ts in-place (it is already a content script; no new manifest entry is needed). Bump IDB to v3, add the `tab-state` store, follow the same `oldVersion < N` guard pattern from v2. The 600ms cap should be implemented as a `setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)` started at the same time as the MutationObserver, with `RESTORE_CAP_MS = 550` to leave 50ms of headroom under the 600ms FR-12 budget.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scroll + form capture | Content Script | — | Only the content script has DOM access to read scroll position and form values |
| Debounce + flush timing | Content Script | — | Event debouncing lives where the events originate |
| State persistence (IDB write) | Service Worker | — | Phase 3 invariant: all IDB writes in SW only |
| GET_STATE lookup + response | Service Worker | — | SW owns the IDB store; content script cannot open IDB directly |
| State apply (scroll/form inject) | Content Script | — | Only the content script has DOM access to set scroll and field values |
| MutationObserver retry loop | Content Script | — | Observes the page DOM; must live in the content script |
| Eviction on tab close | Service Worker | — | SW owns IDB + listens to chrome.tabs.onRemoved |
| URL-match guard | Service Worker (lookup) + Content Script (double-check) | — | SW checks on GET_STATE; content script verifies before applying |
| tabId discovery | Service Worker (via sender.tab.id) | — | Content scripts cannot call chrome.tabs API; SW reads sender.tab.id from incoming message |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| idb | 8.0.3 (installed) | IDB wrapper for v3 upgrade + CRUD | Already in use; singleton pattern established in idb.ts [VERIFIED: package.json] |
| fake-indexeddb | 6.2.5 (installed) | IDB in vitest/jsdom | Already in use; imported in vitest.setup.ts [VERIFIED: package.json + vitest.setup.ts] |
| vitest | 4.1.5 (installed) | Test runner | Project standard [VERIFIED: package.json] |
| vitest-chrome | 0.1.0 (installed) | Chrome API mocks in tests | Project standard with ESM workaround [VERIFIED: package.json + STATE.md] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new libraries needed | — | — | All capabilities are achievable with DOM APIs (MutationObserver, window.scroll, form element reads) + existing stack |

**Installation:** No new dependencies required.

**Version verification:**

```bash
npm view idb version          # 8.0.3
npm view fake-indexeddb version  # 6.2.5
npm view vitest version       # 4.1.8 (4.1.5 installed)
```

[VERIFIED: npm registry at research time]

---

## Architecture Patterns

### System Architecture Diagram

```
Content Script (form-watcher.ts — every page load at document_idle)
  │
  │── [capture path] ──────────────────────────────────────────────────
  │   scroll/input events (debounced ~500ms)
  │   + pagehide / visibilitychange→hidden flush
  │   └─► sendMessage({ type: 'SAVE_STATE', scroll, fields[], url })
  │                                │
  │                      SW (index.ts onMessage)
  │                                │
  │                      idb.ts putTabState(tabId, snapshot)
  │                      [IDB: smart-hibernator v3, tab-state store]
  │
  │── [restore path] ─────────────────────────────────────────────────
  │   document_idle fires (page has reloaded after discard)
  │   └─► sendMessage({ type: 'GET_STATE', url })
  │                                │
  │                      SW: idb.ts getTabState(sender.tab.id)
  │                      URL-match check
  │                      idb.ts deleteTabState(tabId) [after match]
  │                      sendResponse(snapshot | null)
  │                                │
  │   if snapshot !== null:
  │   ├─► set history.scrollRestoration = 'manual'
  │   ├─► apply scroll (requestAnimationFrame)
  │   ├─► apply form fields (iterate fields[])
  │   └─► MutationObserver watch for lazily-mounted fields
  │       setTimeout(disconnect, RESTORE_CAP_MS=550ms)
  │
  └── [eviction path] ────────────────────────────────────────────────
      chrome.tabs.onRemoved → SW → idb.ts deleteTabState(tabId)
```

### Recommended Project Structure

```
src/
├── content/
│   └── form-watcher.ts       # extend in-place: add capture, flush, restore
├── background/
│   ├── idb.ts                # add tab-state store (version 3 upgrade)
│   ├── index.ts              # add SAVE_STATE, GET_STATE message handlers + onRemoved eviction
│   └── tab-state.ts          # (optional) CRUD helpers for tab-state store, like thumbnail.ts
├── shared/
│   ├── types.ts              # add TabStateSnapshot, FieldSnapshot interfaces
│   └── constants.ts          # add DEBOUNCE_MS, RESTORE_CAP_MS constants
```

### Pattern 1: IDB v3 Upgrade (add tab-state store)

**What:** Bump the `openDB` version from 2 → 3, add a guard for `oldVersion < 3` in the upgrade callback.
**When to use:** Any time a new object store must be added to an existing database.

```typescript
// Source: src/background/idb.ts (existing pattern) + idb@8 docs
// Existing SmartHibernatorDB extended:
interface SmartHibernatorDB {
  thumbnails: { key: number; value: ThumbnailRecord }
  'tab-history': { key: number; value: TabHistoryRecord; indexes: { 'by-domain': string; 'by-timestamp': number } }
  'domain-bias': { key: string; value: DomainBiasRecord }
  'tab-state': { key: number; value: TabStateSnapshot }  // Phase 4 — keyed by tabId
}

// In getDb():
dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 3, {   // 2 → 3
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      if (!db.objectStoreNames.contains('thumbnails')) {
        db.createObjectStore('thumbnails', { keyPath: 'tabId' })
      }
    }
    if (oldVersion < 2) {
      const histStore = db.createObjectStore('tab-history', { keyPath: 'id', autoIncrement: true })
      histStore.createIndex('by-domain', 'domain')
      histStore.createIndex('by-timestamp', 'timestamp')
      db.createObjectStore('domain-bias', { keyPath: 'domain' })
    }
    if (oldVersion < 3) {
      db.createObjectStore('tab-state', { keyPath: 'tabId' })  // Phase 4
    }
  },
  blocked() {
    console.warn('[smart-hibernator] IDB upgrade blocked — close other extension tabs')
  },
  blocking(_currentVersion, _blockedVersion, event) {
    dbPromise = null
    ;(event.target as IDBDatabase).close()  // CR-03 fix preserved
  },
})
```

[VERIFIED: existing idb.ts + idb@8 docs pattern]

### Pattern 2: GET_STATE Async Message Response (return true + sendResponse)

**What:** Content script sends a request; SW looks up IDB and calls `sendResponse()` asynchronously. Must return `true` (literal) from the `onMessage` handler to keep the channel open.
**When to use:** Any SW message handler that does async work before responding.

Note: Chrome 148+ supports returning a Promise from onMessage, but the project targets Chrome 120+ (COMP-01) — use `return true` + `sendResponse` for safe compatibility.

```typescript
// Source: Chrome messaging docs [CITED: developer.chrome.com/docs/extensions/develop/concepts/messaging]
// In SW index.ts onMessage handler:
if (message.type === 'GET_STATE' && sender.tab?.id) {
  const tabId = sender.tab.id
  const url = message.url as string
  getTabState(tabId).then((snapshot) => {
    if (!snapshot || snapshot.url !== url) {
      sendResponse(null)
      return
    }
    deleteTabState(tabId).catch(() => {})   // delete-after-restore (D-06)
    sendResponse(snapshot)
  }).catch(() => sendResponse(null))
  return true  // CRITICAL: keeps channel open for async sendResponse
}
```

### Pattern 3: Debounced Capture + Flush on page events

**What:** Capture scroll + form values on a debounced timer; flush immediately on pagehide / visibilitychange→hidden.

```typescript
// Source: [ASSUMED] standard debounce pattern
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 500

function scheduleCapture(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS)
}

window.addEventListener('scroll', scheduleCapture, { passive: true })
document.addEventListener('input', scheduleCapture, { passive: true })
document.addEventListener('change', scheduleCapture, { passive: true })

// Flush on pagehide (fires on navigations; may also fire before discard — not guaranteed)
window.addEventListener('pagehide', () => {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  sendSnapshot()   // best-effort; SW may be starting up
})

// Flush on visibility→hidden (fires reliably when tab goes to background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    sendSnapshot()
  }
})
```

### Pattern 4: MutationObserver Bounded Restore

**What:** Apply captured state at `document_idle`, then watch for lazy DOM mutations and re-apply until all resolved or the cap expires.

```typescript
// Source: [ASSUMED] MutationObserver + setTimeout cap pattern
const RESTORE_CAP_MS = 550   // leaves 50ms headroom under FR-12 600ms budget

function startRestoreObserver(snapshot: TabStateSnapshot): void {
  history.scrollRestoration = 'manual'
  applyState(snapshot)   // immediate apply on load

  const capTimer = setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)

  const observer = new MutationObserver(() => {
    applyState(snapshot)   // re-apply on each DOM mutation
    // If all fields resolved, disconnect early
    if (allFieldsResolved(snapshot)) {
      clearTimeout(capTimer)
      observer.disconnect()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

function applyState(snapshot: TabStateSnapshot): void {
  // Scroll restore
  requestAnimationFrame(() => {
    window.scrollTo(snapshot.scroll.x, snapshot.scroll.y)
  })
  // Form field restore
  for (const field of snapshot.fields) {
    const el = resolveField(field)   // id → name → CSS-selector-path
    if (!el) continue
    applyFieldValue(el, field)
  }
}
```

### Pattern 5: CSS Selector Path Fallback (D-04)

**What:** For elements without `id` or `name`, generate a robust selector path using `tagName:nth-child(N)` traversal to root.

```typescript
// Source: [ASSUMED] standard nth-child path pattern; recommended by css-selector-generator library ecosystem
function getCssSelectorPath(el: Element): string {
  const path: string[] = []
  let node: Element | null = el
  while (node && node !== document.body) {
    const parent = node.parentElement
    if (!parent) break
    const index = Array.from(parent.children).indexOf(node) + 1
    path.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    node = parent
  }
  return path.join(' > ')
}

// On restore, use querySelector(field.selectorPath) as final fallback
```

**Safety caveat:** `:nth-child` paths are stable across same-page reloads for static DOM, but fragile for React/SPA pages where sibling order may differ between renders. This is acceptable for Phase 4 (main-frame, static + mildly dynamic pages); SPA robustness is limited by design.

### Pattern 6: Field Capture (D-03 exclude + D-04 id/name/path)

```typescript
// Source: [ASSUMED] standard form traversal pattern
const CAPTURE_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'number', 'date',
  'datetime-local', 'month', 'week', 'time', 'color', 'range'
])
const EXCLUDE_AUTOCOMPLETE = new Set(['cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month',
  'cc-exp-year', 'cc-name', 'cc-type', 'one-time-code', 'new-password'])

function shouldCapture(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase()
    if (t === 'password' || t === 'hidden' || t === 'file') return false
    const ac = el.getAttribute('autocomplete') ?? ''
    if (ac.startsWith('cc-') || EXCLUDE_AUTOCOMPLETE.has(ac)) return false
    // For <input> elements, only capture known safe types
    return CAPTURE_INPUT_TYPES.has(t) || t === 'checkbox' || t === 'radio'
  }
  return true  // textarea, select are always captured
}
```

### Anti-Patterns to Avoid

- **Returning a Promise from async onMessage handler on Chrome < 148:** Chrome 120 targets require `return true` + explicit `sendResponse()` — an `async` listener auto-returns a Promise, which is not supported on Chrome 120+. [CITED: developer.chrome.com/docs/extensions/develop/concepts/messaging]
- **Opening IDB from the content script:** Violates Phase 3 invariant. Content script sends messages to SW; SW does all IDB reads/writes.
- **Setting `window.scrollTo()` synchronously without `requestAnimationFrame`:** The layout may not have rendered the full page height yet. Use `requestAnimationFrame` to defer to the next paint cycle.
- **Using `dbPromise = null` without calling `.close()` in the `blocking` handler:** CR-03 fix (already in idb.ts) shows that nullifying the promise is insufficient — the underlying connection must be explicitly closed. Preserve this pattern in the v3 upgrade.
- **Removing the `scroll` listener without `{ passive: true }`:** Scroll listeners without passive cause janky behavior on low-end devices; always add `{ passive: true }`.
- **Listening to `unload` for flush:** `unload` is deprecated and may not fire reliably in MV3 service workers or on discarded tabs. Use `pagehide` + `visibilitychange→hidden`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB transactions | Custom IDB wrapper | `idb@8` (already installed) | Handles transaction lifetimes, version upgrades, blocked/blocking — battle-tested |
| CSS selector generation | Custom traversal from scratch | Hand-rolled nth-child path (Pattern 5 above) is adequate for this scope; `css-selector-generator` npm package if more robustness needed | Phase 4 needs only a minimal path; adding a library for a 20-line function is overkill |
| Debounce utility | Custom debounce | Inline `setTimeout`/`clearTimeout` (Pattern 3 above) | Simple enough to inline; no lodash dependency needed |

**Key insight:** The core challenge in this phase is Chrome API timing and privacy exclusions — not algorithmic complexity. Hand-rolling scroll/form capture is appropriate; the IDB layer should remain handled by the existing `idb` library.

---

## Research Question Answers

### Q1: Does Chrome reliably preserve sessionStorage across chrome.tabs.discard() + reload?

**Finding:** PARTIALLY CONFIRMED with important nuance.

Chrome's own [Tab Discarding blog](https://developer.chrome.com/blog/tab-discarding) states: "Form content, scroll position and so on are saved and restored the same way they would be during forward/backward tab navigation." This implies sessionStorage survives (as it does during history navigation). However:

1. The Page Lifecycle API documentation says "no events fire" during discard and is silent on sessionStorage.
2. The WICG page-lifecycle GitHub issue #26 (opened by Jake Archibald) notes the spec says sessionStorage "can be discarded" and was unresolved as of research time.
3. MDN's sessionStorage documentation states it "survives page reloads" but is silent on discard.

**Conclusion (D-02 validation):** D-02 is likely correct that sessionStorage survives Chrome's `chrome.tabs.discard()` + reactivation cycle (Chrome preserves it as part of the "session history" mechanism, similar to back/forward navigation). However, this is **[ASSUMED]** for Phase 4 purposes — the phase explicitly captures scroll + form regardless, so even if sessionStorage did not survive, FR-11 would still be met.

**Risk if wrong:** Low. Phase 4 captures what discard loses (scroll, form values) explicitly. SessionStorage is a bonus for SPA state, not a dependency of FR-11.

[CITED: developer.chrome.com/blog/tab-discarding] [ASSUMED: sessionStorage survival across discard]

---

### Q2: Tab lifecycle on discard activation — event sequence

When a discarded tab is activated:

1. **`chrome.tabs.onActivated`** fires immediately (tabId changes).
2. **Chrome reloads the page** — the renderer process was shut down; the page starts a full navigation.
3. **`chrome.tabs.onUpdated`** fires with `changeInfo.discarded === false` at the `loading` status. This is the SW's wake signal (Phase 3 CR-02 fix already handles this).
4. **`chrome.tabs.onUpdated`** fires again with `status === 'complete'` when the page finishes loading.
5. **Content script re-injects** at `document_idle` (after DOM is ready, equivalent to DOMContentLoaded + all resources).

**Content script gets its tabId:** `chrome.tabs` is NOT available to content scripts. The correct pattern is for the content script to send `GET_STATE { url }` via `chrome.runtime.sendMessage()`, and the SW reads `sender.tab.id` from the `MessageSender` to identify the tab. The SW includes `tabId` in the `sendResponse` payload so the content script knows its own ID for subsequent messages (e.g., SAVE_STATE). This is Claude's discretion per CONTEXT.md.

[CITED: developer.chrome.com/docs/extensions/reference/api/tabs — content scripts cannot access chrome.tabs]
[ASSUMED: event ordering — onActivated → discarded:false → status:complete → document_idle]

---

### Q3: history.scrollRestoration = 'manual' vs native restore

Chrome's native scroll restoration on page load (`history.scrollRestoration = 'auto'`) will attempt to restore the scroll position based on history entries. For a discarded-and-reloaded tab, Chrome may attempt to restore scroll itself. If Phase 4 also restores scroll, there can be a conflict where the browser's native restore fires first, then our restore fires and conflicts.

**Recommended approach:** Set `history.scrollRestoration = 'manual'` at the top of the restore path (before calling `window.scrollTo`). This disables Chrome's automatic scroll restoration for that navigation, giving Phase 4 full control.

**When to set it:** Only when a snapshot is found (`GET_STATE` returns non-null). Don't set it on normal (non-restore) loads.

```typescript
// Correct: set before applying scroll
history.scrollRestoration = 'manual'
requestAnimationFrame(() => window.scrollTo(snapshot.scroll.x, snapshot.scroll.y))
```

[CITED: developer.chrome.com/blog/history-api-scroll-restoration]
[ASSUMED: Chrome's native discard restore interacts with scrollRestoration]

---

### Q4: MutationObserver bounded retry pattern

The pattern is straightforward — see Pattern 4 above. Key implementation notes:

- Start the `RESTORE_CAP_MS` timer **at the same time** as the observer, not after each mutation.
- On each mutation callback, call `applyState()` again. This is idempotent: already-resolved fields are re-set (harmless) while newly-mounted fields get filled.
- Track which fields have been resolved to allow early disconnect. A field is "resolved" once `resolveField(field)` returns a non-null element AND the value has been applied.
- `observe(document.body, { childList: true, subtree: true })` is the right configuration — we're watching for new elements added to the subtree, not attribute changes.

**Memory/cleanup:** Always call `observer.disconnect()` in both the timeout handler and the early-exit path. Failing to disconnect leaks the observer in long-lived pages.

[ASSUMED: MutationObserver pattern — standard DOM API, no specific source needed]

---

### Q5: CSS-selector-path generation

For D-04's fallback: an `:nth-child`-based path from the element up to `document.body` (Pattern 5 above) is the standard approach used by all major CSS selector generator libraries (css-selector-generator, finder, unique-selector).

**Correctness caveats:**
- **Stable for static DOM:** `:nth-child` positions are stable on reload for server-rendered pages.
- **Fragile for SPAs:** React/SPA pages may render siblings in different order between renders. For Phase 4 (which covers the main-frame document and targets the common case), this is acceptable.
- **Shadow DOM:** Elements inside shadow roots are NOT reachable by `querySelector` from outside. D-03 restricts capture to `input/textarea/select` matched with standard selectors; shadow DOM fields are silently skipped (they won't resolve at restore time — D-04's "skip unresolved" behavior covers this).
- **contenteditable:** Not captured by Phase 4 (not in the D-03 include list). This is correct from a privacy standpoint — contenteditable may contain arbitrary rich text or sensitive data.

[CITED: npmjs.com/package/css-selector-generator — library uses nth-child fallback chains]

---

### Q6: FR-12 (<600ms) measurement and test strategy

**How to measure at runtime:** Capture `performance.now()` when `GET_STATE` response arrives, compute delta when `observer.disconnect()` fires (either via cap or early exit).

**How to assert in vitest:**

`performance.now()` is NOT faked by default by `vi.useFakeTimers()`. Must explicitly opt-in:

```typescript
// Source: github.com/vitest-dev/vitest/issues/9352
vi.useFakeTimers({ toFake: ['performance', 'setTimeout'] })

// Test: observer disconnects by cap
it('observer disconnects within RESTORE_CAP_MS', () => {
  const disconnectSpy = vi.fn()
  // ... set up MutationObserver mock with disconnect spy
  vi.advanceTimersByTime(550)   // RESTORE_CAP_MS
  expect(disconnectSpy).toHaveBeenCalled()
})
```

**What fits in the budget:** At `document_idle` on a normal HTTP/HTTPS page:
- GET_STATE message roundtrip to SW: ~5–30ms (SW already warm from being active)
- requestAnimationFrame scroll: ~16ms (one frame)
- Initial form field apply: <5ms for typical form sizes
- MutationObserver overhead: negligible per callback

The 550ms cap covers the bulk of the budget for lazy SPAs. The remaining 50ms buffer handles SW startup delay if the SW was sleeping.

[VERIFIED: vitest@4.1.5 behavior — performance.now() requires explicit toFake opt-in]
[CITED: github.com/vitest-dev/vitest/issues/9352]

---

### Q7: IDB version bump — no conflict with existing stores

Current database version: **2** (set in Phase 3). Existing stores: `thumbnails`, `tab-history`, `domain-bias`.

Phase 4 bumps to **version 3** and adds `tab-state`. The `oldVersion < 3` guard in the upgrade callback ensures existing stores are not touched. The `blocked` / `blocking` handlers are already implemented correctly (including CR-03's `.close()` call) — preserve them verbatim.

**No conflict:** The three existing stores will continue to function; the upgrade only adds a new store in the `oldVersion < 3` branch.

**fake-indexeddb note:** In tests, the singleton `dbPromise` must be reset between test files that open different DB versions. The existing pattern in `idb.test.ts` does not reset `dbPromise` between describes — this is fine because all tests use the same version. For Phase 4 test isolation, import `fake-indexeddb/auto` (already done in `vitest.setup.ts`) and ensure `dbPromise` is reset by nullifying the module-level variable between test runs if testing the upgrade path. The simplest approach: test `putTabState`/`getTabState`/`deleteTabState` as black-box CRUD (same pattern as existing idb.test.ts describes) without testing the upgrade callback itself.

[VERIFIED: src/background/idb.ts — DB version 2, stores confirmed by code inspection]

---

### Q8: Privacy/security landmines for form text persisted to IDB

D-03's exclusion list covers the most critical categories. Additional considerations for the planner:

1. **`autocomplete="off"` fields:** Sites set this to signal "don't autofill/save this field." Phase 4 ignores this attribute per D-03's design (D-03 explicitly lists the autocomplete values to exclude, not a blanket `autocomplete="off"` check). This is a conscious privacy decision — the extension only captures fields the user explicitly typed in, and all data stays local. Documenting this in code comments is recommended.

2. **Large payload risk:** A page with 100+ text inputs could produce a large JSON blob. Recommend a field count cap (e.g., max 50 fields per snapshot) and a per-field value length cap (e.g., max 10,000 chars). These are Claude's discretion.

3. **Shadow DOM:** Fields inside shadow roots are not reachable by `querySelectorAll('input, textarea, select')` from the top-level document (shadow DOM encapsulation). These fields are silently skipped — correct behavior.

4. **`contenteditable`:** Not captured. Correct — could contain arbitrary rich text with embedded links, scripts, or sensitive data.

5. **Incognito tabs:** `chrome.tabs.discard()` does not discard incognito tabs (Chrome protects them). Phase 4 does not need special incognito handling — the SAVE_STATE message will simply never arrive for incognito tabs. However, if testing, note that vitest-chrome does not simulate incognito mode.

6. **TabId reuse:** Chrome tab IDs are unique within a browser session but CAN be reused across browser restarts. Since Phase 4 snapshots are deleted after restore (D-06) and on tab close (onRemoved eviction), stale snapshots from a previous session are evicted before the next session starts. The URL-match guard (D-06) is the defense against same-session reuse (e.g., user closes a tab and Chrome assigns the same ID to a newly opened tab — the URL will differ, preventing mis-injection).

[ASSUMED: incognito discard behavior — standard Chrome behavior, not extension-API-specific]
[CITED: developer.chrome.com/docs/extensions/reference/api/tabs — Tab IDs unique within a session]

---

### Q9: Pitfalls and races

See Common Pitfalls section below.

---

## Common Pitfalls

### Pitfall 1: async onMessage handler returns Promise on Chrome 120

**What goes wrong:** Writing `chrome.runtime.onMessage.addListener(async (message, sender) => { ... })` returns a Promise. Chrome 120 does not support Promise-based message responses; the content script's `sendMessage()` call times out with no response.

**Why it happens:** `async` functions always return Promises, even if you intend `return true`. The Chrome MV3 spec only added Promise support in Chrome 148.

**How to avoid:** Use synchronous handler body + `return true` + explicit `sendResponse` callback for the `GET_STATE` handler (Pattern 2 above). All existing SW handlers in `index.ts` use this pattern — follow it.

**Warning signs:** `chrome.runtime.lastError: "The message port closed before a response was received."` in content script console.

[CITED: developer.chrome.com/docs/extensions/develop/concepts/messaging]

---

### Pitfall 2: SW asleep when content script sends SAVE_STATE (pagehide flush)

**What goes wrong:** `pagehide` fires just as the user switches away from the tab. The SW may have been idle for > 30 seconds and is terminating. `chrome.runtime.sendMessage()` throws/rejects because there's no SW to receive the message.

**Why it happens:** MV3 SWs terminate after ~30s of inactivity. The extension's existing code already handles this with `.catch(() => {})` on `reportFormActivity()`.

**How to avoid:** All SAVE_STATE sends (debounced and flush) must use `.catch(() => {})` — best-effort, no throw. The continuous debounced capture (D-01) means the SW has already received multiple SAVE_STATE messages during the tab's lifetime; the final flush is a bonus, not a dependency. A missing flush loses at most 500ms of changes (the debounce window).

**Warning signs:** Unhandled promise rejections in content script console on tab switch.

[VERIFIED: src/content/form-watcher.ts line 6 — `.catch(() => {})` pattern already established]

---

### Pitfall 3: Applying restore on normal (non-discard) loads

**What goes wrong:** Every page load sends GET_STATE. If a stale snapshot exists (e.g., the eviction onRemoved handler was missed), the extension injects form values into a newly-opened page.

**Why it happens:** GET_STATE is sent on every document_idle load, not just after discard.

**How to avoid:** Double defense:
1. **SW URL-match check (D-06):** SW returns null if stored URL !== current URL.
2. **Delete-after-restore (D-06):** SW deletes the snapshot after returning it — even if the URL matched by coincidence, the snapshot is consumed immediately.
3. **onRemoved eviction (D-06):** When the tab is closed, the snapshot is deleted.

The `document.wasDiscarded` property could be used as a third guard in the content script (only send GET_STATE if `document.wasDiscarded === true`), but this adds complexity for little gain given the existing URL-match + delete-after-restore protection. Claude's discretion — document.wasDiscarded guard is optional.

---

### Pitfall 4: performance.now() not faked in vitest by default

**What goes wrong:** Tests asserting that restore completes within 600ms using `performance.now()` spans produce non-deterministic results — `performance.now()` uses real wall clock time.

**How to avoid:** Use `vi.useFakeTimers({ toFake: ['performance', 'setTimeout'] })` in the test. This is a known vitest quirk documented in github.com/vitest-dev/vitest/issues/9352.

[VERIFIED: vitest@4.1.5 — confirmed by issue #9352 and confirmed this version is installed]

---

### Pitfall 5: IDB singleton dbPromise not reset between test files

**What goes wrong:** If two test files import `idb.ts` in the same vitest worker process, the module-level `dbPromise` is reused. A version-2 promise opened in test-file-A is returned to test-file-B that expects version 3, resulting in wrong schema.

**Why it happens:** ESM module-level state is shared within a vitest worker.

**How to avoid:** The existing `idb.test.ts` works around this by using `fake-indexeddb/auto` in `vitest.setup.ts` (which installs a fresh in-memory IDB for each test run). The new Phase 4 IDB tests should follow the same pattern as existing describes: black-box CRUD tests that don't reset dbPromise manually. If isolation issues appear, add `beforeEach(() => { IDBFactory.reset?.() })` — the `fake-indexeddb@6` API supports this.

[VERIFIED: vitest.setup.ts — fake-indexeddb/auto imported at setup level]

---

### Pitfall 6: Large form payloads blocking IDB

**What goes wrong:** A page with large `<textarea>` values (e.g., a markdown editor with 100KB of text) serializes the entire value into the snapshot, producing a large IDB write per debounce tick (every 500ms while the user types).

**How to avoid:** Add caps at capture time:
- Max 50 fields per snapshot (`fields.slice(0, MAX_FIELDS)`)
- Max value length per field: 10,000 characters (`value.slice(0, MAX_FIELD_VALUE_LEN)`)

These are Claude's discretion; recommend adding them as named constants in `src/shared/constants.ts`.

---

### Pitfall 7: scrollRestoration = 'manual' set on all loads

**What goes wrong:** If `history.scrollRestoration = 'manual'` is set unconditionally in the content script (not just when a snapshot is found), all tabs lose Chrome's native scroll restoration for browser back/forward navigation.

**How to avoid:** Only set `history.scrollRestoration = 'manual'` in the restore path, after confirming `GET_STATE` returned a non-null snapshot.

---

## Code Examples

### tabId discovery: SW reads sender.tab.id

```typescript
// Source: [VERIFIED: src/background/index.ts — sender.tab?.id pattern already used for FORM_ACTIVITY]
// In SW onMessage handler:
if (message.type === 'GET_STATE' && sender.tab?.id) {
  const tabId = sender.tab.id   // SW reads from sender, content script never needs tabs API
  // ...
}
```

### Capture: collect current scroll + form values

```typescript
// Source: [ASSUMED]
function captureState(): { scroll: { x: number; y: number }; fields: FieldSnapshot[] } {
  const scroll = { x: window.scrollX, y: window.scrollY }
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select'
  )
  const fields: FieldSnapshot[] = []
  for (const el of inputs) {
    if (!shouldCapture(el)) continue
    const value = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
      ? String(el.checked)
      : (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
    fields.push({
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      selectorPath: (!el.id && !el.getAttribute('name')) ? getCssSelectorPath(el) : undefined,
      value: value.slice(0, MAX_FIELD_VALUE_LEN),
      type: el.tagName.toLowerCase() + (el instanceof HTMLInputElement ? `[${el.type}]` : ''),
    })
    if (fields.length >= MAX_FIELDS) break
  }
  return { scroll, fields }
}
```

### Restore: resolveField by id → name → selectorPath

```typescript
// Source: [ASSUMED]
function resolveField(field: FieldSnapshot): Element | null {
  if (field.id) return document.getElementById(field.id)
  if (field.name) return document.querySelector(`[name="${CSS.escape(field.name)}"]`)
  if (field.selectorPath) return document.querySelector(field.selectorPath)
  return null
}
```

### IDB CRUD for tab-state store

```typescript
// Source: [ASSUMED] — follows existing thumbnail CRUD pattern in idb.ts
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

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.tabs.discard()` with URL-redirect placeholder | Native discard (Phase 2 D-01) | Phase 2 | Content script re-injects naturally on wake — no special handling needed |
| `unload` event for flush | `pagehide` + `visibilitychange→hidden` | Chrome ~2019+ | `unload` is unreliable; both new events fire more reliably in modern Chrome |
| `chrome.runtime.onMessage` async via Promise return | `return true` + `sendResponse` for Chrome 120 compat; Promise supported in Chrome 148+ | Chrome 148 | Phase 4 must use `return true` pattern for COMP-01 (Chrome 120+) |
| IndexedDB direct from content script | All IDB in SW only (Phase 3 invariant) | Phase 3 | Eliminates cross-context transaction conflicts |

**Deprecated/outdated:**
- `beforeunload` for state flush: deprecated, may not fire on discard, avoid.
- `document.wasDiscarded`: Useful for detecting restores in the page context, but Phase 4's GET_STATE → null pattern makes it unnecessary.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sessionStorage` survives `chrome.tabs.discard()` + reload (D-02) | Q1 / Summary | Low — Phase 4 captures scroll+form explicitly regardless; sessionStorage is a bonus |
| A2 | Event sequence on discard reactivation: onActivated → discarded:false → status:complete → document_idle | Q2 | Medium — if content script fires earlier, GET_STATE may race with SW warmup; but best-effort send + SW startup handles this |
| A3 | `history.scrollRestoration = 'manual'` prevents Chrome's native discard scroll restore from conflicting | Q3 | Low — if it doesn't conflict, setting manual is harmless (just removes native restore) |
| A4 | `pagehide` fires reliably before chrome.tabs.discard() acts | Q9 Pitfall 2 | Low — continuous debounced capture (D-01) means flush is a bonus, not a dependency |
| A5 | Chrome incognito tabs are not discarded by chrome.tabs.discard() | Q8 | Low — if wrong, the extension would simply capture/restore incognito form data locally (still zero-telemetry) |
| A6 | MutationObserver bounded by setTimeout cap is the correct pattern for lazy DOM in 600ms | Q4 | Low — this is the canonical pattern; the risk is that some pages load so slowly that 550ms cap still misses fields |

---

## Open Questions

1. **Does `document.wasDiscarded` remain `true` at `document_idle`?**
   - What we know: `wasDiscarded` is set in Chrome 68+ and is readable at page load time.
   - What's unclear: Whether it remains `true` through the full document_idle lifecycle or resets at some point.
   - Recommendation: Use as an optional early guard in the content script (skip GET_STATE if `document.wasDiscarded === false`), but this optimization is low-priority. D-08 design works without it.

2. **SW cold-start latency during GET_STATE response on slow machines**
   - What we know: SW may be sleeping when the discarded tab is reactivated; GET_STATE message wakes it up.
   - What's unclear: How much of the 600ms budget SW startup consumes on slow/low-memory devices.
   - Recommendation: Continuous capture (D-01) ensures state is already in IDB before the discard; the only latency is the GET_STATE round-trip. Accept the risk for Phase 4; add a timeout on the content script's `sendMessage` if SW startup proves problematic in practice.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is purely content-script + SW code + IDB. No external tools, services, databases, or CLIs beyond the existing project stack (Node.js, npm, vitest) are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose src/content/form-watcher.test.ts src/background/idb.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-11 | Capture: scroll + form values collected correctly | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ Wave 0 |
| FR-11 | Capture: excluded field types are not captured (D-03) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ Wave 0 |
| FR-11 | Capture: field matching id → name → selectorPath (D-04) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ Wave 0 |
| FR-11 | SW: SAVE_STATE message persists snapshot to IDB | unit | `npm test -- src/background/index.test.ts` | ✅ (exists, extend) |
| FR-11 | SW: GET_STATE returns snapshot on URL match, null on mismatch | unit | `npm test -- src/background/index.test.ts` | ✅ (exists, extend) |
| FR-11 | SW: GET_STATE deletes snapshot after returning it (D-06) | unit | `npm test -- src/background/idb.test.ts` | ✅ (exists, extend) |
| FR-11 | SW: onRemoved eviction deletes tab-state entry | unit | `npm test -- src/background/index.test.ts` | ✅ (exists, extend) |
| FR-11 | IDB: putTabState / getTabState / deleteTabState CRUD | unit | `npm test -- src/background/idb.test.ts` | ✅ (exists, extend) |
| FR-12 | MutationObserver disconnects within RESTORE_CAP_MS (550ms) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ Wave 0 |
| FR-12 | Restore does not exceed 600ms cap (fake timer assertion) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ Wave 0 |

### vitest fake timer requirement for FR-12 tests

```typescript
// In form-watcher.test.ts — required for performance.now() to be controlled
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})
```

### Sampling Rate

- **Per task commit:** `npm test -- src/content/form-watcher.test.ts src/background/idb.test.ts src/background/index.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (`npm test` — 0 failures) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/content/form-watcher.test.ts` — covers FR-11 capture/restore and FR-12 timing
- [ ] Extend `src/background/idb.test.ts` — add `tab-state` CRUD describe block
- [ ] Extend `src/background/index.test.ts` — add SAVE_STATE, GET_STATE, onRemoved eviction test cases
- [ ] Extend `vitest.setup.ts` — add stubs for any new chrome APIs needed (none expected — existing mocks cover sendMessage/onMessage)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Field exclusion list (D-03) — autocomplete, type checks before persist |
| V6 Cryptography | no | All data stays local; zero-telemetry (NFR-04) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sensitive field capture (password, OTP, CC) | Information Disclosure | D-03 exclusion list — type and autocomplete attribute checks at capture time |
| SAVE_STATE spoofing from malicious page | Tampering | sender.tab?.id check in SW — only messages with valid tab sender are processed |
| Large payload DoS (giant textarea) | Denial of Service | Field count cap (MAX_FIELDS) + per-field value length cap (MAX_FIELD_VALUE_LEN) |
| TabId reuse stale injection | Tampering / Spoofing | D-06 URL-match guard + delete-after-restore |
| Shadow DOM exfiltration | Information Disclosure | querySelectorAll does not pierce shadow roots — silently skipped |

---

## Sources

### Primary (HIGH confidence)

- `src/background/idb.ts` — existing IDB version 2 pattern, blocked/blocking handlers, singleton; Phase 4 must follow exactly
- `src/content/form-watcher.ts` — existing content script injection point and messaging pattern
- `src/background/index.ts` — SW message router; `sender.tab.id` usage confirmed
- `vitest.setup.ts` — confirmed vitest-chrome ESM workaround, fake-indexeddb setup
- `package.json` — confirmed installed versions: idb@8.0.3, fake-indexeddb@6.2.5, vitest@4.1.5, vitest-chrome@0.1.0
- `.planning/STATE.md` — Phase 3 "All IndexedDB writes in SW only" invariant, vi.hoisted() pattern, callListeners() pattern

### Secondary (MEDIUM confidence)

- [developer.chrome.com/blog/tab-discarding](https://developer.chrome.com/blog/tab-discarding) — form content and scroll position preserved across discard
- [developer.chrome.com/docs/web-platform/page-lifecycle-api](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) — no events fire on discard; wasDiscarded property
- [developer.chrome.com/docs/extensions/develop/concepts/messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — `return true` pattern for async sendResponse; Chrome 148 Promise support
- [developer.chrome.com/blog/history-api-scroll-restoration](https://developer.chrome.com/blog/history-api-scroll-restoration) — history.scrollRestoration = 'manual'
- [github.com/vitest-dev/vitest/issues/9352](https://github.com/vitest-dev/vitest/issues/9352) — vi.useFakeTimers() does not fake performance.now() by default; requires `toFake: ['performance']`
- [npmjs.com/package/css-selector-generator](https://www.npmjs.com/package/css-selector-generator) — nth-child fallback chain pattern

### Tertiary (LOW confidence — noted as ASSUMED)

- sessionStorage survival across chrome.tabs.discard() — consistent with Chrome Tab Discarding blog but not explicitly confirmed in spec
- Event sequence on discard reactivation (exact ordering of onActivated → discarded:false → document_idle)
- incognito tab discard behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed from package.json; versions verified from npm registry
- Architecture: HIGH — follows directly from locked decisions + existing codebase patterns
- Chrome lifecycle behaviors: MEDIUM — Chrome Tab Discarding blog cited; spec is ambiguous on sessionStorage
- Pitfalls: HIGH — based on existing code (CR-03, Phase 3 invariant, vitest-chrome workarounds) + verified Chrome messaging docs

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days — Chrome API stability; vitest version pinned)
