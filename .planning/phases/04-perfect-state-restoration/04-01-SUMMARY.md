---
phase: 04-perfect-state-restoration
plan: 01
subsystem: database
tags: [indexeddb, idb, typescript, vitest, fake-timers, types, constants]

# Dependency graph
requires:
  - phase: 03-ai-intelligence
    provides: idb v2 with tab-history and domain-bias stores; shared types pattern
provides:
  - FieldSnapshot + TabStateSnapshot interfaces in shared/types.ts
  - DEBOUNCE_MS, RESTORE_CAP_MS, MAX_FIELDS, MAX_FIELD_VALUE_LEN constants
  - IDB v3 tab-state object store with putTabState/getTabState/deleteTabState CRUD helpers
  - tab-state CRUD test block in idb.test.ts
  - form-watcher.test.ts scaffold with FR-12 fake-timer setup and todo placeholders
affects:
  - 04-02-sw-handlers (consumes putTabState, getTabState, deleteTabState from idb.ts)
  - 04-03-content-script-capture-restore (consumes TabStateSnapshot type and form-watcher.test.ts scaffold)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IDB version-bump additive upgrade (oldVersion < N branch per version)
    - makeStateSnapshot factory for IDB black-box CRUD tests
    - vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] }) for FR-12 timing tests
    - it.todo() placeholder describe blocks for downstream plan test scaffolding

key-files:
  created:
    - src/content/form-watcher.test.ts
  modified:
    - src/shared/types.ts
    - src/shared/constants.ts
    - src/background/idb.ts
    - src/background/idb.test.ts

key-decisions:
  - "Phase 4 IDB version bump: v2 -> v3 using additive oldVersion < 3 branch; existing stores untouched"
  - "tab-state store keyed by tabId (keyPath); no size-cap prune (delete-after-restore + onRemoved eviction in 04-02 bound cardinality)"
  - "form-watcher.test.ts uses it.todo() placeholders (not failing tests) so scaffold compiles and passes before 04-03 implements capture/restore logic"
  - "FR-12 fake-timer setup opts in performance.now() explicitly (vitest issue #9352 — not faked by default)"

patterns-established:
  - "Pattern F: makeStateSnapshot factory mirrors makeThumbnail / makeHistoryRecord for IDB CRUD tests"
  - "Pattern G: Phase 4 constants under // Phase 4 — State Restoration constants comment header"

requirements-completed: [FR-11, FR-12]

# Metrics
duration: 5min
completed: 2026-06-14
---

# Phase 04 Plan 01: Phase 4 Data Foundation Summary

**IDB v3 tab-state store with TabStateSnapshot/FieldSnapshot types, four timing/cap constants, and form-watcher.test.ts FR-12 fake-timer scaffold establishing the Wave 0 contracts consumed by 04-02 and 04-03**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-14T11:14:00Z
- **Completed:** 2026-06-14T11:21:46Z
- **Tasks:** 3/3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Added `FieldSnapshot` and `TabStateSnapshot` interfaces to `shared/types.ts` following existing Phase 3 interface convention
- Added four Phase 4 constants (`DEBOUNCE_MS=500`, `RESTORE_CAP_MS=550`, `MAX_FIELDS=50`, `MAX_FIELD_VALUE_LEN=10_000`) to `shared/constants.ts`
- Bumped IDB version to 3, added `tab-state` objectStore, and exported three CRUD helpers (`putTabState`, `getTabState`, `deleteTabState`)
- Extended `idb.test.ts` with `tab-state CRUD (FR-11)` describe block (4 tests, all green)
- Created `form-watcher.test.ts` with FR-12 fake-timer scaffolding and 4 `it.todo()` placeholder describe blocks

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 4 types and constants** - `912b853` (feat)
2. **Task 2: Add IDB v3 tab-state store + CRUD helpers** - `ce7ec4d` (feat)
3. **Task 3: Create test scaffolds** - `1d45d07` (test)

## Files Created/Modified
- `src/shared/types.ts` - Added `FieldSnapshot` and `TabStateSnapshot` interfaces after `DomainBiasRecord`
- `src/shared/constants.ts` - Added four Phase 4 timing/cap constants
- `src/background/idb.ts` - Bumped to v3, added tab-state store + CRUD helpers; TabStateSnapshot added to SmartHibernatorDB interface
- `src/background/idb.test.ts` - Added `makeStateSnapshot` factory and `tab-state CRUD (FR-11)` describe block
- `src/content/form-watcher.test.ts` - New file: Wave 0 infrastructure check + FR-12 fake-timer setup + 4 todo describe blocks

## Decisions Made
- IDB version bump is additive: `oldVersion < 3` branch only; `oldVersion < 1` and `oldVersion < 2` branches untouched
- `tab-state` store needs no prune logic — delete-after-restore (GET_STATE handler in 04-02) and `onRemoved` eviction bound cardinality per D-06
- `form-watcher.test.ts` uses `it.todo()` (not `it.skip()`) so vitest reports todos, not skipped, matching the Nyquist scaffold intent
- `performance.now()` explicitly opted into fake timers via `toFake` array (vitest issue #9352)
- `StorageSchema` left unchanged — TabStateSnapshot lives in IDB, not `chrome.storage`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — TypeScript compiled cleanly, all 18 tests pass with 4 todos.

## Known Stubs
None — this plan defines data contracts only; no rendering or data-source wiring occurs here.

## Threat Flags
None — no new network endpoints, auth paths, or file access patterns introduced. IDB store addition is internal to the extension.

## Next Phase Readiness
- `putTabState`, `getTabState`, `deleteTabState` are exported and tested — 04-02 SW handlers can import them immediately
- `TabStateSnapshot` and `FieldSnapshot` types are ready for `form-watcher.ts` capture implementation in 04-03
- `form-watcher.test.ts` todo blocks are the exact targets 04-03 will fill in
- No blockers.

## Self-Check
- [x] `src/shared/types.ts` — FieldSnapshot and TabStateSnapshot present
- [x] `src/shared/constants.ts` — all 4 constants present
- [x] `src/background/idb.ts` — v3, tab-state store, 3 CRUD helpers
- [x] `src/background/idb.test.ts` — tab-state CRUD describe block present
- [x] `src/content/form-watcher.test.ts` — file created, fake-timer setup, 4 describe blocks

---
*Phase: 04-perfect-state-restoration*
*Completed: 2026-06-14*
