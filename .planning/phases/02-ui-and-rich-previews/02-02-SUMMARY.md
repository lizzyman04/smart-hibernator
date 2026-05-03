---
phase: 02-ui-and-rich-previews
plan: "02"
subsystem: background
tags: [idb, thumbnail, indexeddb, offscreencanvas, tdd, service-worker, fr-08]

# Dependency graph
requires:
  - phase: 02-01
    provides: idb@8.0.3 installed, HibernationEvent + StorageSchema types, IDB_SIZE_CAP_BYTES + THUMBNAIL_MAX_SIZE_BYTES constants, fake-indexeddb/auto wired, manifest activeTab permission, Wave 0 test stubs

provides:
  - src/background/idb.ts: IndexedDB CRUD + pruneIfNeeded via idb@8.0.3 module-level singleton
  - src/background/thumbnail.ts: captureAndStore + compressToWebP (OffscreenCanvas guard, 800x600 scale, WebP 0.7 quality)
  - src/background/index.ts: onUpdated listener for thumbnail capture + extended onRemoved + extended onInstalled with timeout_minutes/hibernation_events backfill
  - src/background/hibernation.ts: handleAlarmTick reads timeout_minutes; isDiscardable has timeoutMs 6th param; HibernationEvent appended on each discard with 7-day rolling window

affects:
  - 02-03 (popup redesign — reads thumbnails from IDB via getThumbnail/getAllThumbnails)
  - 02-04 (dashboard — reads hibernation_events from storage for 7-day chart)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - idb@8.0.3 module-level singleton: let dbPromise = null; getDb() initializes once per SW lifetime
    - OffscreenCanvas guard: typeof OffscreenCanvas === 'undefined' -> return null (jsdom-safe)
    - TDD RED/GREEN: write failing tests first, implement until green, commit each phase separately
    - 7-day rolling window: filter hibernation_events on every append (not a separate cron)
    - pruneIfNeeded: dataUrl.length * 0.75 approximates decoded byte size; evict oldest-first

key-files:
  created:
    - src/background/idb.ts (IndexedDB CRUD + pruneIfNeeded singleton)
    - src/background/thumbnail.ts (captureAndStore + compressToWebP)
  modified:
    - src/background/idb.test.ts (Wave 0 stubs replaced with 6 behavioral tests)
    - src/background/thumbnail.test.ts (Wave 0 stubs replaced with 4 behavioral tests)
    - src/background/index.ts (onUpdated + extended onRemoved + extended onInstalled)
    - src/background/hibernation.ts (timeoutMs param, timeout_minutes storage read, HibernationEvent append)
    - src/background/hibernation.test.ts (TIMEOUT_MS added as 6th arg to all 12 isDiscardable calls)

key-decisions:
  - "idb.ts uses module-level dbPromise singleton — openDB called once per SW lifetime, reused across all CRUD calls"
  - "pruneIfNeeded uses dataUrl.length * 0.75 as byte approximation — accepted per T-02-02-02 (slight over/under estimation is fine)"
  - "compressToWebP returns null in jsdom (no OffscreenCanvas) — captureAndStore silently skips putThumbnail; no error thrown"
  - "isDiscardable now takes timeoutMs as 6th parameter — TIMEOUT_MS constant stays in constants.ts for test imports; hibernation.ts no longer imports it"
  - "hibernation_events 7-day filter applied on every append inside storage callback — no separate cleanup job needed"

requirements-completed: [FR-08]

# Metrics
duration: 25min
completed: "2026-05-03"
---

# Phase 2 Plan 02: Wave 1 SW Backend Summary

**IndexedDB CRUD singleton (idb.ts), thumbnail capture pipeline (thumbnail.ts), onUpdated/onRemoved/onInstalled extensions in index.ts, timeout_minutes + HibernationEvent integration in hibernation.ts — npm test: 6 files, 28 passing, 12 todo, 0 failures**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-03T22:03:00Z
- **Completed:** 2026-05-03T22:07:31Z
- **Tasks:** 3/3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- Created `src/background/idb.ts` with full IndexedDB CRUD using idb@8.0.3 module-level singleton. Exports: `putThumbnail`, `getThumbnail`, `deleteThumbnail`, `getAllThumbnails`, `pruneIfNeeded`, `ThumbnailRecord`. The `pruneIfNeeded` function evicts oldest-by-capturedAt entries when total `dataUrl.length * 0.75` exceeds 25 MB cap.
- Created `src/background/thumbnail.ts` with `compressToWebP` (OffscreenCanvas guard → null in jsdom, scale to 800×600, WebP at quality 0.7, retry at 0.4 if >250 KB) and `captureAndStore` (calls `captureVisibleTab`, pipes through compress, stores in IDB).
- Replaced Wave 0 `idb.test.ts` stubs with 6 behavioral tests (1 infra + 5 FR-08 contract); all pass with fake-indexeddb.
- Replaced Wave 0 `thumbnail.test.ts` stubs with 4 behavioral tests (1 infra + 3 FR-08 contract); OffscreenCanvas guard verified null in jsdom.
- Extended `index.ts` with: `onUpdated` listener (guards: `status === 'complete'` AND `tab.active` AND `url.startsWith('http')`); `deleteThumbnail(tabId)` in `onRemoved`; `timeout_minutes: 45` and `hibernation_events: []` in `onInstalled` install branch; backfill guards for both new keys in update branch.
- Modified `hibernation.ts`: removed `TIMEOUT_MS` import (kept `FORM_PROTECTION_MS`); added `HibernationEvent` import; added `timeoutMs: number` as 6th parameter to `isDiscardable`; reads `timeout_minutes` from storage in `handleAlarmTick`; computes `timeoutMs = (timeout_minutes ?? 45) * 60 * 1000`; appends `HibernationEvent` on each successful discard with 7-day rolling window cutoff.
- Updated `hibernation.test.ts`: added `TIMEOUT_MS` as 6th argument to all 12 `isDiscardable` call sites — all 12 existing tests still pass.

## Task Commits

1. **Task 1: Create idb.ts and implement IDB CRUD tests** - `e0c4920` (feat) — TDD RED then GREEN
2. **Task 2: Create thumbnail.ts and implement capture tests** - `c3466b7` (feat) — TDD RED then GREEN
3. **Task 3: Extend index.ts and hibernation.ts for Phase 2 integration** - `c278f18` (feat)

## Files Created/Modified

### Created
- `src/background/idb.ts` - IndexedDB CRUD singleton: putThumbnail, getThumbnail, deleteThumbnail, getAllThumbnails, pruneIfNeeded (25 MB cap eviction)
- `src/background/thumbnail.ts` - captureAndStore + compressToWebP with OffscreenCanvas guard

### Modified
- `src/background/idb.test.ts` - Wave 0 stubs replaced with 6 real tests (fake-indexeddb, all passing)
- `src/background/thumbnail.test.ts` - Wave 0 stubs replaced with 4 real tests (idb mocked, all passing)
- `src/background/index.ts` - onUpdated listener + extended onRemoved + extended onInstalled
- `src/background/hibernation.ts` - timeoutMs 6th param, timeout_minutes storage read, HibernationEvent append with 7-day filter
- `src/background/hibernation.test.ts` - TIMEOUT_MS added as 6th arg to all 12 isDiscardable calls

## Decisions Made

- idb.ts module-level singleton (`let dbPromise: ... | null = null`) — `openDB` called once per SW lifetime, reused across all CRUD calls without re-opening the database
- `pruneIfNeeded` uses `dataUrl.length * 0.75` as byte approximation — slight over/under estimation is acceptable per threat model T-02-02-02; the 25 MB cap is itself conservative
- `compressToWebP` returns `null` in jsdom (no `OffscreenCanvas`) — `captureAndStore` silently skips `putThumbnail` when compress returns null; no error thrown, no IDB write
- `isDiscardable` now takes `timeoutMs` as 6th parameter — `TIMEOUT_MS` constant stays in `constants.ts` for `hibernation.test.ts` which imports it directly for test setup; `hibernation.ts` no longer imports it
- `hibernation_events` 7-day filter applied on every append inside the storage callback — no separate cleanup job or scheduled task needed

## Deviations from Plan

None — plan executed exactly as written. All 4 changes to `index.ts`, all 4 changes to `hibernation.ts`, TDD RED/GREEN cycle followed for Tasks 1 and 2.

## TypeScript Notes

- `hibernation.test.ts` required 12 call-site updates (one per `isDiscardable` call) to add `TIMEOUT_MS` as 6th arg — `TIMEOUT_MS` was already imported on line 4 of the test file so no new import was needed.
- No new TypeScript errors introduced. Pre-existing errors (chrome globals, tsconfig baseUrl) noted in 02-01-SUMMARY remain out of scope.

## npm test Results

- **Before plan:** 6 files, 20 passing, 20 todo
- **After plan:** 6 files, 28 passing, 12 todo, 0 failures
- **Net new passing tests:** +8 (6 idb + 4 thumbnail = 10 new; minus 2 infra checks already passing = 8 net new behavioral tests)
- **Todo remaining:** 12 (popup + dashboard stubs — Plans 02-03 and 02-04)

## Known Stubs

- `src/popup/App.test.tsx` — 5 todo tests still pending (Plan 02-03)
- `src/dashboard/App.test.tsx` — 7 todo tests still pending (Plan 02-04)

These are intentional Wave 0 contracts, not regressions.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced beyond what the threat model in the plan documents (T-02-02-01 through T-02-02-04). All threats accepted or mitigated per plan.

## Self-Check: PASSED

- `src/background/idb.ts` exists — confirmed via `find` (idb.ts in listing)
- `src/background/thumbnail.ts` exists — confirmed via `find` (thumbnail.ts in listing)
- Task 1 commit `e0c4920` — verified in git log
- Task 2 commit `c3466b7` — verified in git log
- Task 3 commit `c278f18` — verified in git log
- `npm test` exits 0: 6 files, 28 passing, 12 todo, 0 failures
- All plan verification checks pass:
  1. npm test exits 0 ✓
  2. idb.ts and thumbnail.ts exist ✓
  3. `captureAndStore` in index.ts ✓
  4. `timeoutMs: number` in hibernation.ts ✓
  5. `'timeout_minutes'` in hibernation.ts ✓
  6. `deleteThumbnail(tabId)` in index.ts ✓
