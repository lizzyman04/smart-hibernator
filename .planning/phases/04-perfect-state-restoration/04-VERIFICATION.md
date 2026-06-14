---
phase: 04-perfect-state-restoration
verified: 2026-06-14T11:45:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Load the extension unpacked in Chrome, open a long scrollable page (e.g. news site), scroll 1000px down, type text into a text input and a password input on the same page, then force-discard via chrome://discards and click the discarded tab."
    expected: "Tab reloads and lands at the prior scroll position with the typed text pre-filled in the text input. The password field must be blank. The perceived transition takes less than 600ms."
    why_human: "end-to-end warm-up (content script receives GET_STATE, MutationObserver re-applies state after DOM settles) requires a real Chrome environment with an actual tab discard/reload cycle; cannot be automated without a browser driver."
  - test: "During the above test, observe the password field after restoration."
    expected: "Password field value is empty — it must NOT be restored."
    why_human: "D-03 exclusion at capture time is unit-tested, but the absence of a value in a real extension run needs human confirmation."
  - test: "Open DevTools > Application > IndexedDB > smart-hibernator > tab-state. After waking the tab, verify the entry for the active tab's tabId is deleted."
    expected: "No record remains in the tab-state store after the tab is restored (delete-after-restore, D-06)."
    why_human: "IDB delete-after-restore logic is unit-tested in index.test.ts, but the delete-after-restore race with real Chrome IDB (opened by SW) needs a human sanity check in the actual extension environment."
---

# Phase 4: Perfect State Restoration — Verification Report

**Phase Goal:** Ensure that waking a tab feels like it was never gone by restoring scroll position and form input state across the native discard/reload cycle, within 600ms.
**Verified:** 2026-06-14T11:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Waking a tab restores the exact scroll position it had before hibernation | VERIFIED | `startRestore()` in `src/content/form-watcher.ts:235` calls `applyState()` which does `requestAnimationFrame(() => window.scrollTo(snapshot.scroll.x, snapshot.scroll.y))`. Scroll is captured via `window.scrollX/scrollY` in `captureState()` and sent via SAVE_STATE. SW stores it in IDB; GET_STATE returns it on wake. Scroll round-trip tested end-to-end via unit tests (58/58 passing). |
| SC-2 | Form input data is persisted and re-injected upon tab restoration | VERIFIED | `shouldCapture()` (D-03 privacy gate) + `captureState()` collect form fields; `sendSnapshot()` fires SAVE_STATE to SW which calls `putTabState()` on IDB. On wake, GET_STATE returns the snapshot and `startRestore()` calls `applyFieldValue()` for each field via `resolveField()` (id→name→selectorPath). 13 exclusion tests + 5 captureState tests green. |
| SC-3 | The transition from "Discarded" to "Active" completes in less than 600ms | VERIFIED (programmatic portion) | MutationObserver is capped at `RESTORE_CAP_MS = 550ms` via `setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)`. This leaves 50ms headroom under the 600ms FR-12 budget (D-07). Fake-timer test `vi.advanceTimersByTime(550)` asserts `disconnectSpy` is called. Scroll is deferred to next animation frame (not blocking). **Human test required for real-browser E2E.** |

**Score:** 3/3 truths verified (SC-3 programmatic portion verified; real-browser E2E deferred to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/types.ts` | FieldSnapshot + TabStateSnapshot interfaces | VERIFIED | Lines 43-57. `interface FieldSnapshot { id?, name?, selectorPath?, value, type }` and `interface TabStateSnapshot { tabId, url, scroll, fields, capturedAt }` present and exported. StorageSchema unchanged. |
| `src/shared/constants.ts` | DEBOUNCE_MS, RESTORE_CAP_MS, MAX_FIELDS, MAX_FIELD_VALUE_LEN | VERIFIED | Lines 45-54. All four constants under `// Phase 4 — State Restoration constants` header. Values: 500, 550, 50, 10_000. |
| `src/background/idb.ts` | IDB v3 tab-state store + putTabState/getTabState/deleteTabState | VERIFIED | `openDB('smart-hibernator', 3, ...)` at line 39. `oldVersion < 3` branch creates `tab-state` store at line 52-54. Three CRUD helpers at lines 181-200. `SmartHibernatorDB` interface includes `'tab-state': { key: number; value: TabStateSnapshot }`. CR-03 `.close()` preserved in `blocking` handler at line 65. |
| `src/background/index.ts` | SAVE_STATE + GET_STATE handlers + onRemoved eviction | VERIFIED | SAVE_STATE handler at line 155 (guards `sender.tab?.id`, calls `putTabState().catch()`). GET_STATE handler at line 174 (URL-match guard at line 178, delete-after-restore at line 182, `sendResponse`, `return true` at line 185). onRemoved eviction at line 140 (`deleteTabState(tabId).catch()`). onMessage listener is NOT async. |
| `src/content/form-watcher.ts` | Debounced capture + D-03 exclusions + GET_STATE pull + bounded MutationObserver | VERIFIED | 261-line implementation. DEBOUNCE_MS=500, RESTORE_CAP_MS=550, MAX_FIELDS=50, MAX_FIELD_VALUE_LEN=10000 inlined. `shouldCapture()` at line 68 enforces D-03. `scheduleCapture()` debounces at line 144. pagehide/visibilitychange flush at lines 163-173. `startRestore()` at line 235 sets scrollRestoration='manual' only when snapshot found. GET_STATE callback overload at line 256. |
| `src/background/idb.test.ts` | tab-state CRUD describe block with makeStateSnapshot factory | VERIFIED | `describe('tab-state CRUD (FR-11)')` at line 191. `makeStateSnapshot` factory present. 4 tests covering put/get/delete/fields round-trip. |
| `src/content/form-watcher.test.ts` | 27 tests across 4 describe blocks, FR-12 fake-timer setup | VERIFIED | File exists. `vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })` at line 11. 4 describe blocks (captureState, shouldCapture exclusions, resolveField matching, startRestore/MutationObserver cap). 27 tests passing, 0 todos remaining. |
| `src/background/index.test.ts` | tab-state messaging + onRemoved eviction describe blocks | VERIFIED | `describe('tab-state messaging (FR-11)')` with 5 tests and `describe('onRemoved eviction (FR-11 D-06)')` with 1 test present. 14/14 tests passing. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/background/idb.ts` | `src/shared/types.ts` | `import type TabStateSnapshot` | VERIFIED | Line 6: `import type { TabHistoryRecord, DomainBiasRecord, TabStateSnapshot } from '../shared/types'` |
| `src/background/idb.ts` | tab-state IDB store | `db.put/get/delete('tab-state', ...)` | VERIFIED | Lines 182, 190, 197 use `db.put('tab-state', record)`, `db.get('tab-state', tabId)`, `db.delete('tab-state', tabId)` |
| `src/background/index.ts` | `putTabState/getTabState/deleteTabState` in `idb.ts` | import + call | VERIFIED | Line 9: `import { deleteThumbnail, putTabState, getTabState, deleteTabState } from './idb'`. Called at lines 164, 177, 182, 140. |
| GET_STATE handler | open message channel | `return true` after async sendResponse | VERIFIED | Line 185: `return true   // CRITICAL: keeps message channel open for async sendResponse`. onMessage listener is NOT async (Chrome 120 COMP-01). |
| `src/content/form-watcher.ts` | SW SAVE_STATE handler | `chrome.runtime.sendMessage` fire-and-forget | VERIFIED | Line 131-138: `chrome.runtime.sendMessage({ type: 'SAVE_STATE', url, scroll, fields }).catch(() => {})` |
| `src/content/form-watcher.ts` | SW GET_STATE handler | callback overload sendMessage | VERIFIED | Line 256: `chrome.runtime.sendMessage({ type: 'GET_STATE', url: location.href }, (snapshot) => { ... startRestore(snapshot) })` — callback form, not Promise |
| restore path | RESTORE_CAP_MS observer disconnect | `setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)` | VERIFIED | Line 240: exact pattern present |

### Data-Flow Trace (Level 4)

**Capture path (SAVE_STATE):**

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `form-watcher.ts` sendSnapshot | `{ scroll, fields }` from `captureState()` | `window.scrollX/Y` + `querySelectorAll` DOM | Yes — live DOM values | FLOWING |
| `index.ts` SAVE_STATE handler | `TabStateSnapshot` from message body | `sender.tab.id` + `message.url/scroll/fields` | Yes — real tab state | FLOWING |
| `idb.ts` putTabState | stored record | `db.put('tab-state', record)` | Yes — IDB write | FLOWING |

**Restore path (GET_STATE):**

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `form-watcher.ts` GET_STATE pull | `snapshot` callback arg | SW getTabState IDB read | Yes — real stored snapshot | FLOWING |
| `index.ts` GET_STATE handler | `snapshot` from `getTabState(tabId)` | `db.get('tab-state', tabId)` | Yes — real IDB read with URL-match guard | FLOWING |
| `form-watcher.ts` startRestore | `snapshot.scroll`, `snapshot.fields` | passed from GET_STATE response | Yes — real captured state | FLOWING |

No hollow props, no static returns, no hardcoded empty values in any Phase 4 data path.

### Behavioral Spot-Checks

Step 7b: SKIPPED — the Phase 4 code runs inside a Chrome Extension content script + Service Worker environment. No runnable entry points accessible without a browser driver. Human verification is the correct gate for E2E behavior.

### Probe Execution

Step 7c: No probes declared in any PLAN.md or SUMMARY.md. No `scripts/*/tests/probe-*.sh` files found for Phase 4. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FR-11 | 04-01, 04-02, 04-03 | Content scripts must capture and restore scroll position and form data | SATISFIED | Full stack: types (04-01) + IDB CRUD (04-01) + SW handlers (04-02) + content script capture/restore (04-03). 58 passing tests cover the entire FR-11 stack. |
| FR-12 | 04-01, 04-03 | Restoration must complete in < 600ms upon tab activation | SATISFIED (programmatic) | RESTORE_CAP_MS=550ms cap enforced via `setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)`. Scroll deferred to next rAF (non-blocking). Fake-timer test verifies disconnect at exactly 550ms. Real-browser timing requires human test. |

**No orphaned requirements** — REQUIREMENTS.md maps FR-11 and FR-12 to Phase 4 only, and both are claimed by plans 04-01 through 04-03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

No `TBD`, `FIXME`, or `XXX` markers in any Phase 4 modified file. No placeholder/stub implementations. No hardcoded empty data in rendering paths. No `return null`/`return {}`/`return []` stubs (only legitimate use: `return null` in `resolveField` when no element matches, which is correct behavior by design).

### Human Verification Required

#### 1. End-to-End Scroll + Form Restoration

**Test:** Load extension unpacked in Chrome. Open a long scrollable page (e.g. a news site or Wikipedia article), scroll ~1000px down, type text into a visible text input AND a password input on the same page. Navigate to `chrome://discards` and discard the tab. Click the discarded tab to wake it.

**Expected:** Tab reloads at the prior scroll position. The text input contains the typed text. The password input is blank. The visible restoration completes in under ~600ms (subjectively fast, no noticeable delay before scroll/form state settles).

**Why human:** End-to-end discard/reload cycle with a real Service Worker, real IDB, and a live content script receiving GET_STATE requires a browser environment. The MutationObserver/rAF sequence cannot be simulated in jsdom with confidence about actual frame timing.

#### 2. Password Exclusion Confirmation

**Test:** Same setup as above. Focus on the password field after tab wake.

**Expected:** Password field is empty — no value is restored.

**Why human:** The D-03 exclusion is unit-tested (`shouldCapture` returns false for `type=password`), but confirming that the value never appears in the actual SAVE_STATE network message and never reaches IDB benefits from a human sanity check in the real extension.

#### 3. Delete-After-Restore IDB Confirmation

**Test:** After waking the tab (same test), open DevTools > Application > IndexedDB > `smart-hibernator` > `tab-state` and inspect the store.

**Expected:** The entry for the woken tab's tabId is absent — it was deleted by the GET_STATE handler (`deleteTabState(tabId)`) before `sendResponse(snapshot)` was called.

**Why human:** IDB delete-after-restore is unit-tested in `index.test.ts` via mock, but verifying the real IDB state in Chrome's storage inspector confirms the D-06 lifecycle works end-to-end in the actual extension environment.

### Gaps Summary

No programmatic gaps found. All 3 roadmap success criteria are verified in the codebase. The single remaining item (SC-3 real-browser E2E timing) is properly gated as human verification, not a code gap — the 550ms cap is implemented and unit-tested via fake timers.

---

_Verified: 2026-06-14T11:45:00Z_
_Verifier: Claude (gsd-verifier)_
