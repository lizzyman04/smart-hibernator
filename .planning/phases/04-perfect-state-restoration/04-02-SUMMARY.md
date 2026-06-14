---
phase: 04-perfect-state-restoration
plan: 02
subsystem: service-worker
tags: [service-worker, indexeddb, messaging, chrome-runtime, tdd, vitest, typescript, fr-11]

# Dependency graph
requires:
  - phase: 04-perfect-state-restoration
    plan: 01
    provides: putTabState/getTabState/deleteTabState CRUD helpers and TabStateSnapshot/FieldSnapshot types
provides:
  - SAVE_STATE onMessage handler in src/background/index.ts (fire-and-forget IDB write, D-05)
  - GET_STATE onMessage handler in src/background/index.ts (async URL-match + delete-after-restore, D-06)
  - onRemoved deleteTabState eviction in src/background/index.ts (D-06)
  - Test coverage for all three handlers in src/background/index.test.ts
affects:
  - 04-03-content-script-capture-restore (consumes SAVE_STATE + GET_STATE message contract)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pattern B: sender.tab?.id guard for content-script message authentication (T-04-04)
    - Pattern C: async sendResponse with return true (Chrome 120 compat, COMP-01)
    - Pattern D: vi.hoisted() + vi.mock('./idb') factory extension for tab-state mocks
    - Pattern E: callListeners() to trigger SW event handlers in tests (Phase 3 established)
    - TDD RED commit (test) then GREEN commit (feat) gate

key-files:
  created: []
  modified:
    - src/background/index.ts
    - src/background/index.test.ts

key-decisions:
  - "SAVE_STATE and GET_STATE handlers added before FORM_ACTIVITY to maintain early-return order"
  - "onMessage listener signature extended to (message, sender, sendResponse) — not async (COMP-01)"
  - "GET_STATE returns true only on its own branch; all other handlers return undefined/void"
  - "deleteTabState(tabId) placed in onRemoved alongside deleteThumbnail (D-06 eviction)"
  - "tabId always from sender.tab.id not message body (T-04-04 spoofing mitigation)"

patterns-established:
  - "Pattern: GET_STATE async branch uses .then()/.catch() chain, not async/await, to keep return true as literal boolean"

requirements-completed: [FR-11]

# Metrics
duration: ~4min
completed: 2026-06-14
---

# Phase 04 Plan 02: SW Handlers (SAVE_STATE + GET_STATE + onRemoved Eviction) Summary

**SAVE_STATE fire-and-forget IDB write + GET_STATE URL-match/delete-after-restore + onRemoved eviction wired in Service Worker, with vitest TDD (RED + GREEN) covering all 6 behavior cases**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T11:26:00Z
- **Completed:** 2026-06-14T11:29:16Z
- **Tasks:** 2/2
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- Extended `src/background/index.ts` onMessage handler:
  - Added `sendResponse` parameter (required for async GET_STATE response)
  - SAVE_STATE handler: guards `sender.tab?.id`, builds `TabStateSnapshot`, calls `putTabState().catch(() => {})` (fire-and-forget, D-05 SW-only write)
  - GET_STATE handler: guards `sender.tab?.id`, uses `getTabState().then()` chain with `snapshot.url !== url` check (T-04-05 D-06), calls `deleteTabState` on match, calls `sendResponse(snapshot|null)`, returns `true` (Chrome 120 COMP-01)
- Extended `onRemoved` listener with `deleteTabState(tabId).catch(() => {})` alongside existing `deleteThumbnail` (D-06 tab-close eviction)
- Extended `vi.mock('./idb')` factory in `index.test.ts` with `putTabState`, `getTabState`, `deleteTabState` mocks
- Added `vi.hoisted()` block for per-test `getTabState` reconfiguration
- Added `describe('tab-state messaging (FR-11)')` with 5 test cases covering all behavior paths
- Added `describe('onRemoved eviction (FR-11 D-06)')` with 1 test case

## Task Commits

Each task was committed atomically (TDD RED-GREEN):

1. **RED: failing tests for SAVE_STATE/GET_STATE/onRemoved** - `f4256f9` (test)
2. **GREEN: SAVE_STATE + GET_STATE handlers and onRemoved eviction** - `e80fe13` (feat)

## Files Created/Modified

- `src/background/index.ts` - Added SAVE_STATE handler, GET_STATE handler (return true), onRemoved deleteTabState eviction; extended imports
- `src/background/index.test.ts` - Extended vi.mock('./idb') factory; added vi.hoisted() block; added two describe blocks (6 total tests)

## Decisions Made

- onMessage listener is NOT async — COMP-01 requires `return true` literal + `sendResponse` callback for Chrome 120+; async listener returns Promise (unsupported pre-Chrome 148)
- SAVE_STATE and GET_STATE placed as the first two guards in onMessage to keep early-return order clean before FORM_ACTIVITY / MANUAL_HIBERNATE / CAPTURE_TAB / KEEP_ALIVE
- `tabId` always sourced from `sender.tab.id`, never from `message.tabId` — T-04-04 spoofing defense
- DELETE_AFTER_RESTORE (`deleteTabState`) called inside `.then()` before `sendResponse(snapshot)` — consumed immediately to prevent replay (T-04-05)
- `getTabState().then().catch()` chain (not async/await) so the enclosing function body can `return true` as a literal boolean value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing failure in `src/offscreen/main.test.ts` > `executionProviders is ["wasm"] only when navigator.gpu is undefined` — this test was already failing before plan 04-02 started (confirmed by git stash test). Out of scope per deviation rules. Logged to deferred-items.

## Known Stubs

None — this plan wires real IDB CRUD via helpers from 04-01. No hardcoded or placeholder values in the message handlers.

## Threat Flags

All threats addressed by implementation:

| T-ID | Mitigation Implemented |
|------|------------------------|
| T-04-04 | `sender.tab?.id` guard on both SAVE_STATE and GET_STATE — tabId from sender only |
| T-04-05 | `snapshot.url !== url` check before restore; delete-after-restore prevents replay |
| T-04-06 | Accepted — sendResponse routes only to originating tab (Chrome routing) |
| T-04-07 | `return true` only on GET_STATE branch; `sendResponse` always called on resolve and catch |

## TDD Gate Compliance

- RED gate: `test(04-02)` commit `f4256f9` — 5 new tests failing (SAVE_STATE/GET_STATE/onRemoved)
- GREEN gate: `feat(04-02)` commit `e80fe13` — all 14 tests passing

## Self-Check

- [x] `src/background/index.ts` — SAVE_STATE handler present (line 155)
- [x] `src/background/index.ts` — GET_STATE handler present (line 174) with `return true` (line 185)
- [x] `src/background/index.ts` — `deleteTabState(tabId)` in onRemoved (line 140)
- [x] `src/background/index.ts` — onMessage listener is NOT async
- [x] `src/background/index.ts` — import extended: `putTabState, getTabState, deleteTabState`
- [x] `src/background/index.test.ts` — `tab-state messaging (FR-11)` describe block present
- [x] `src/background/index.test.ts` — `onRemoved eviction (FR-11 D-06)` describe block present
- [x] `src/background/index.test.ts` — idb mock factory exports putTabState/getTabState/deleteTabState
- [x] `npm test -- src/background/index.test.ts` — 14/14 passing, 0 failures

---
*Phase: 04-perfect-state-restoration*
*Completed: 2026-06-14*
