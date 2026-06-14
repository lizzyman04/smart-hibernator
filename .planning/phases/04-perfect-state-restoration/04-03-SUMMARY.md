---
phase: 04-perfect-state-restoration
plan: 03
subsystem: content-script
tags: [content-script, form-capture, scroll-restore, mutationobserver, debounce, tdd, vitest, fake-timers, fr-11, fr-12]

# Dependency graph
requires:
  - phase: 04-perfect-state-restoration
    plan: 01
    provides: FieldSnapshot/TabStateSnapshot types; DEBOUNCE_MS/RESTORE_CAP_MS/MAX_FIELDS/MAX_FIELD_VALUE_LEN constants; form-watcher.test.ts scaffold
  - phase: 04-perfect-state-restoration
    plan: 02
    provides: SAVE_STATE fire-and-forget IDB write; GET_STATE URL-match/delete-after-restore; onRemoved eviction
provides:
  - Debounced scroll+form capture with D-03 privacy exclusions in src/content/form-watcher.ts
  - pagehide + visibilitychange->hidden flush in src/content/form-watcher.ts
  - GET_STATE pull at document_idle with bounded MutationObserver restore in src/content/form-watcher.ts
  - 27 passing tests covering captureState/shouldCapture/resolveField/startRestore in src/content/form-watcher.test.ts
affects:
  - Manual verification: load unpacked, scroll+type+discard+reactivate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inlined constants (no import) per content-script convention: DEBOUNCE_MS=500, RESTORE_CAP_MS=550, MAX_FIELDS=50, MAX_FIELD_VALUE_LEN=10000
    - Local structural types mirroring shared/types.ts (LocalFieldSnapshot, LocalTabStateSnapshot) without import
    - shouldCapture: CAPTURE_INPUT_TYPES Set + EXCLUDE_AUTOCOMPLETE Set; startsWith('cc-') prefix check
    - getCssSelectorPath: nth-child traversal to document.body for id/name-less elements (D-04 fallback)
    - sendSnapshot: fire-and-forget SAVE_STATE via .catch(()=>{}) (SW may be sleeping, Pitfall 2)
    - scheduleCapture: clearTimeout+setTimeout debounce at DEBOUNCE_MS
    - Flush handlers: pagehide + visibilitychange->hidden clear debounce timer and call sendSnapshot()
    - resolveField: getElementById -> querySelector([name="..."]) -> querySelector(selectorPath) -> null
    - startRestore: scrollRestoration='manual' only when snapshot found (Pitfall 7); requestAnimationFrame scroll; bounded MutationObserver with simultaneous capTimer at RESTORE_CAP_MS (FR-12)
    - GET_STATE callback overload (not Promise) for Chrome 120 compat (COMP-01)
    - CSS.escape fallback: typeof CSS !== 'undefined' && CSS.escape guard for JSDOM compat

key-files:
  created: []
  modified:
    - src/content/form-watcher.ts
    - src/content/form-watcher.test.ts

key-decisions:
  - "Content script uses no imports — all constants/types inlined as local consts/types identical to shared/ to follow no-import content-script convention"
  - "CSS.escape guarded with typeof CSS !== 'undefined' — JSDOM (vitest env) does not expose CSS global; fallback uses manual quote escaping"
  - "FORM_ACTIVITY keydown listener preserved; new document.addEventListener('input', ...) for scheduleCapture is additive and also calls reportFormActivity"
  - "GET_STATE uses callback overload (sendMessage(msg, callback)) not Promise form — Chrome 120 COMP-01 compat"
  - "scrollRestoration='manual' set ONLY in startRestore (when snapshot non-null) — not on normal loads (Pitfall 7)"

patterns-established:
  - "Pattern H: CSS.escape JSDOM guard — typeof CSS !== 'undefined' && CSS.escape before using CSS.escape in content scripts tested in jsdom"

requirements-completed: [FR-11, FR-12]

# Metrics
duration: ~8min
completed: 2026-06-14
---

# Phase 04 Plan 03: Content Script Capture + Restore Summary

**Debounced scroll+form capture with D-03 privacy exclusions, flush on pagehide/visibilitychange, and bounded MutationObserver restore (FR-12 cap at RESTORE_CAP_MS=550ms) completing the Phase 4 state restoration end-to-end**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-14T11:32:00Z
- **Completed:** 2026-06-14T11:40:00Z
- **Tasks:** 2/2
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- Extended `src/content/form-watcher.ts` from 23 lines to 260+ lines:
  - Inlined local constants (DEBOUNCE_MS=500, RESTORE_CAP_MS=550, MAX_FIELDS=50, MAX_FIELD_VALUE_LEN=10000) per no-import convention
  - Inlined local structural types (LocalFieldSnapshot, LocalTabStateSnapshot) mirroring shared/types.ts
  - Added `CAPTURE_INPUT_TYPES` Set and `EXCLUDE_AUTOCOMPLETE` Set for D-03 privacy gate
  - Implemented `shouldCapture(el)`: rejects password/hidden/file and cc-*/one-time-code/new-password autocomplete; accepts text-like/checkbox/radio/textarea/select
  - Implemented `getCssSelectorPath(el)`: nth-child traversal to document.body (D-04 fallback for elements without id/name)
  - Implemented `captureState()`: scroll {x,y} + includable form fields; caps at MAX_FIELDS; truncates values to MAX_FIELD_VALUE_LEN; serializes checkbox/radio as 'true'/'false'
  - Implemented `sendSnapshot()`: fire-and-forget SAVE_STATE via .catch(()=>{})
  - Implemented `scheduleCapture()`: clearTimeout+setTimeout debounce at DEBOUNCE_MS
  - Registered scroll/input/change listeners with { passive: true } where applicable
  - Added pagehide flush: clears debounce timer and calls sendSnapshot()
  - Added visibilitychange->hidden flush: same pattern
  - Preserved existing FORM_ACTIVITY keydown listener; input listener is additive (calls both reportFormActivity and scheduleCapture)
  - Implemented `resolveField(field)`: getElementById -> querySelector([name=...]) -> querySelector(selectorPath) -> null (D-04)
  - Implemented `applyFieldValue(el, field)`: checkbox/radio .checked from 'true'/'false'; others .value
  - Implemented `applyState(snapshot)`: requestAnimationFrame scroll + form field apply (idempotent)
  - Implemented `allFieldsResolved(snapshot)`: early disconnect predicate for MutationObserver
  - Implemented `startRestore(snapshot)`: sets scrollRestoration='manual' (only here), calls applyState, starts simultaneous capTimer at RESTORE_CAP_MS + MutationObserver on document.body
  - Added GET_STATE pull at module scope using callback overload (Chrome 120 COMP-01)

- Filled `src/content/form-watcher.test.ts` with 27 passing tests (0 todos remaining):
  - Wave 0 infrastructure check (pre-existing, passes)
  - `captureState`: scroll {x,y}, include text, exclude password, cap at 50 fields, truncate to 10000, serialize checkbox
  - `shouldCapture exclusions`: password/hidden/file/cc-number/cc-exp/one-time-code/new-password return false; text/textarea/select/checkbox/radio/email return true
  - `resolveField matching`: id wins, name fallback, selectorPath fallback, null when unresolved
  - `startRestore / MutationObserver cap`: disconnect spy called after vi.advanceTimersByTime(550); scrollRestoration='manual' set; normal load doesn't set it

## Task Commits

TDD RED-GREEN pattern:

1. **RED: failing tests for all four describe blocks** - `afd8e81` (test)
2. **GREEN: implement form-watcher.ts capture + restore** - `9164b3e` (feat)

## Files Created/Modified

- `src/content/form-watcher.ts` - Extended from 23 lines to 260+ lines with full capture + restore implementation; exports captureState, shouldCapture, getCssSelectorPath, resolveField, applyState, allFieldsResolved, startRestore for testing
- `src/content/form-watcher.test.ts` - Filled all 4 todo describe blocks with 26 additional tests (27 total); 0 todos remaining

## Decisions Made

- Inlined constants and local types (no import) per existing content-script convention — build does not bundle shared module imports into the content script the same way
- CSS.escape guarded with `typeof CSS !== 'undefined' && CSS.escape` — JSDOM in vitest does not expose the CSS global; fallback uses manual quote escaping (sufficient for attribute selector safety in test env)
- `document.addEventListener('input', ...)` is additive — existing `keydown` listener for FORM_ACTIVITY preserved; the new input listener calls both `reportFormActivity()` (FORM_ACTIVITY) and `scheduleCapture()` (SAVE_STATE)
- scroll and change listeners added with `{ passive: true }`; input listener calls non-passive code so not passive, consistent with existing keydown listener
- GET_STATE uses callback overload (not Promise form) — Chrome 120 COMP-01 requirement; async handler pattern would return Promise, unsupported on Chrome < 148

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CSS.escape unavailable in JSDOM test environment**
- **Found during:** Task 1 GREEN verification (1 of 27 tests failing)
- **Issue:** `resolveField` called `CSS.escape(field.name)` but JSDOM (vitest environment) does not expose the `CSS` global, causing `TypeError: Cannot read properties of undefined (reading 'escape')`
- **Fix:** Added `typeof CSS !== 'undefined' && CSS.escape` guard with fallback to manual quote escaping (`field.name.replace(/"/g, '\\"')`) — safe for both Chrome runtime (where CSS.escape is available) and JSDOM test environment
- **Files modified:** `src/content/form-watcher.ts`
- **Commit:** `9164b3e` (part of GREEN commit — fix was in the same implementation pass)

## Known Stubs

None — this plan wires real DOM capture via querySelectorAll and real SW messaging via chrome.runtime.sendMessage. No hardcoded or placeholder values. The restore path is fully implemented end-to-end (GET_STATE -> snapshot -> startRestore -> MutationObserver).

## Threat Flags

All five threats from the plan's threat model are addressed:

| T-ID | Mitigation Implemented |
|------|------------------------|
| T-04-08 | shouldCapture enforces D-03 at CAPTURE time: password/hidden/file + cc-*/one-time-code/new-password rejected — secrets never enter SAVE_STATE payload |
| T-04-09 | querySelectorAll('input, textarea, select') does not pierce shadow roots and does not match contenteditable — both excluded by selector scope |
| T-04-10 | Defense-in-depth: SW URL-match + delete-after-restore (04-02) is primary; content script only calls startRestore on GET_STATE non-null response |
| T-04-11 | MAX_FIELDS=50 caps field count; MAX_FIELD_VALUE_LEN=10000 truncates values at capture time |
| T-04-12 | scrollRestoration='manual' set ONLY inside startRestore (when snapshot exists); never on normal loads (Pitfall 7) |

## TDD Gate Compliance

- RED gate: `test(04-03)` commit `afd8e81` — 25 new tests failing (captureState/shouldCapture/resolveField/startRestore)
- GREEN gate: `feat(04-03)` commit `9164b3e` — all 27 tests passing, 0 todos

## Phase 4 End State

With plans 04-01, 04-02, and 04-03 complete, Phase 4 is fully implemented:
- IDB v3 tab-state store with CRUD helpers (04-01)
- SW SAVE_STATE + GET_STATE message handlers + onRemoved eviction (04-02)
- Content script debounced capture + flush + bounded MutationObserver restore (04-03)

Manual verification remains (per 04-VALIDATION.md Manual-Only table): load unpacked, scroll + type into text field AND password field, force-discard via chrome://discards, reactivate; confirm scroll + text restore and password stays blank, within perceived <600ms.

## Self-Check

- [x] `src/content/form-watcher.ts` — `type: 'SAVE_STATE'` present (1 match)
- [x] `src/content/form-watcher.ts` — `DEBOUNCE_MS = 500` present
- [x] `src/content/form-watcher.ts` — `MAX_FIELDS = 50` present
- [x] `src/content/form-watcher.ts` — `'password'` exclusion present
- [x] `src/content/form-watcher.ts` — `one-time-code`, `new-password`, `cc-` exclusions present
- [x] `src/content/form-watcher.ts` — 2 `addEventListener('pagehide'/'visibilitychange')` calls
- [x] `src/content/form-watcher.ts` — `{ passive: true }` present
- [x] `src/content/form-watcher.ts` — `type: 'GET_STATE'` present (1 match)
- [x] `src/content/form-watcher.ts` — `scrollRestoration = 'manual'` present
- [x] `src/content/form-watcher.ts` — `RESTORE_CAP_MS = 550` present
- [x] `src/content/form-watcher.ts` — `setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)` present
- [x] `src/content/form-watcher.ts` — `getElementById` and `querySelector([name` present
- [x] `src/content/form-watcher.ts` — `requestAnimationFrame` present
- [x] `src/content/form-watcher.ts` — GET_STATE uses callback overload
- [x] `src/content/form-watcher.test.ts` — 27 tests, 0 todos, 0 failures
- [x] Commits afd8e81 (RED) and 9164b3e (GREEN) exist in git log

## Self-Check: PASSED

---
*Phase: 04-perfect-state-restoration*
*Completed: 2026-06-14*
