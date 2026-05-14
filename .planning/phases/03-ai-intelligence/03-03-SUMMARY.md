---
phase: 03-ai-intelligence
plan: 03
subsystem: ai
tags: [ai-learning, indexeddb, behavioral-history, domain-bias, isDiscardable, classifyBatch, service-worker, vitest]

# Dependency graph
requires:
  - phase: 03-ai-intelligence
    plan: 02
    provides: "appendTabHistory, getDomainBias, putDomainBias from idb.ts v2; classifyBatch + ensureOffscreen from classifier.ts; Wave 0 types + constants"

provides:
  - src/background/ai-learning.ts: recordKeepAlive (D-09 explicit), recordTabActivation, closeTabVisit (D-03 visit tracking), recordWakeMisclassification (D-09 implicit), __resetOpenVisitMaps
  - src/background/hibernation.ts: isDiscardable() with optional 7th classification param (D-04/D-05/D-06/D-07); handleAlarmTick reads ai_classifications + drives classifyBatch
  - src/background/index.ts: top-level ensureOffscreen(); behavioral event hooks wired; KEEP_ALIVE message handler; ai_install_date + ai_classifications storage defaults

affects:
  - 03-04 (Wave 3 UI — popup reads ai_classifications for V/S/D pill; dashboard reads ai_install_date for countdown)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - vi.hoisted() for sharing mock references between vi.mock() factory and test bodies (inherited from Wave 1)
    - Module-level openVisits + openUrls Maps for bounded visit window tracking (T-03-13)
    - lastActiveTabId module-level variable for closing prior visit window on onActivated
    - Atomic storage.get with all keys in single call (Pitfall 2 — ai_classifications added to hibernation.ts get)
    - candidateTabs pre-filter in handleAlarmTick mirrors isDiscardable structural guards (efficiency)

key-files:
  created:
    - src/background/ai-learning.ts (per-domain bias + visit tracking module)
  modified:
    - src/background/ai-learning.test.ts (Wave 0 stubs → 11 real behavioral tests)
    - src/background/hibernation.ts (isDiscardable 7th param; handleAlarmTick candidateTabs + classifyBatch)
    - src/background/hibernation.test.ts (appended 9 AI integration tests)
    - src/background/index.ts (ensureOffscreen top-level; behavioral hooks; KEEP_ALIVE; install defaults)
    - src/background/index.test.ts (appended 5 Phase 3 wiring tests)

key-decisions:
  - "closeTabVisit deletes both openVisits and openUrls on call rather than on later gc — T-03-13 Map is bounded by open tab count and entries must be cleaned synchronously before async IDB write"
  - "recordWakeMisclassification on cold-start (no existing bias record) always writes initial signal — updatedAt defaults to 0 so Date.now()-0 is very large but the `existing` null check gates the window check: if (!existing) we skip the window check and always write. Cold-start wake = start of bias trail per D-09"
  - "handleAlarmTick uses aiClassifications read from the single atomic get (before classifyBatch) — intentional cold-start on first tick; next tick uses the freshly written classifications"
  - "lastActiveTabId tracked at module level in index.ts to close prior visit window on onActivated without needing a separate storage read per activation"
  - "index.test.ts imports index.ts after all vi.mock() calls so top-level ensureOffscreen() and ensureHibernateAlarm() calls use mocked deps"

# Metrics
duration: ~7min
completed: 2026-05-14
---

# Phase 3 Plan 03: Wave 2 Behavioral Events + AI Integration Summary

**ai-learning.ts module created; isDiscardable applies V/S/D multipliers; handleAlarmTick drives classifyBatch; SW boot warms offscreen document; 99 tests passing (was 76)**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-05-14
- **Tasks:** 3/3
- **Tests:** 99 passing, 0 todo (was 76 passing, 4 todo — net +23 real tests, -4 todos resolved)
- **Files created:** 1, modified: 4

## Accomplishments

- Created ai-learning.ts with module-level openVisits + openUrls Maps (T-03-13), recordKeepAlive (+0.2 bias, AI_BIAS_MAX clamp, NaN guard T-03-11), recordTabActivation (synchronous visit-window open), closeTabVisit (appends TabHistoryRecord, immediate Map cleanup), recordWakeMisclassification (+0.1 bias, AI_WAKE_SIGNAL_WINDOW_MS short-circuit T-03-14), and __resetOpenVisitMaps test helper
- Extended hibernation.ts isDiscardable() with optional 7th classification param: Vital → return false (D-04); Semi-Active → 1.5× timeout (D-05); Dead → 0.5× timeout (D-06); low confidence/null/undefined → base timeoutMs (D-07). effectiveTimeoutMs local variable pattern avoids duplicate inactivity check code
- Extended hibernation.ts handleAlarmTick(): added ai_classifications to atomic storage.get; built candidateTabs pre-filter (mirrors structural guards); calls classifyBatch before discard loop; passes per-tab classification as 7th arg to isDiscardable
- Extended index.ts: top-level ensureOffscreen() call warms Offscreen Document on every SW boot; onInstalled writes ai_install_date + ai_classifications; onActivated closes prior visit + opens new visit via recordTabActivation; onUpdated adds wake-misclassification signal when discarded===false; onRemoved calls closeTabVisit + resets lastActiveTabId; onMessage adds KEEP_ALIVE branch with T-03-12 validation
- All Wave 0 test todos resolved; 23 new behavioral tests green across ai-learning, hibernation, and index suites

## Task Commits

1. **Task 1: ai-learning.ts + ai-learning.test.ts** — `37c76ab`
2. **Task 2: hibernation.ts AI integration + hibernation.test.ts** — `1f20498`
3. **Task 3: index.ts SW lifecycle wiring + index.test.ts** — `73ff1aa`

## Files Created/Modified

- `src/background/ai-learning.ts` — created: bias write, visit tracking, misclassification signal
- `src/background/ai-learning.test.ts` — 11 real tests (was 1 passing + 4 todo)
- `src/background/hibernation.ts` — isDiscardable 7th param + handleAlarmTick classifyBatch integration
- `src/background/hibernation.test.ts` — 9 new AI integration tests appended (D-04..D-07 + structural guards)
- `src/background/index.ts` — ensureOffscreen(); behavioral hooks; KEEP_ALIVE; install/update defaults
- `src/background/index.test.ts` — 5 new Phase 3 wiring tests + module mock scaffolding

## Decisions Made

- closeTabVisit deletes both Maps synchronously before async IDB write (T-03-13 Map cleanup is synchronous — bounded by open tab count)
- Cold-start recordWakeMisclassification (no existing bias record): always writes initial signal — if no existing record, the window check is skipped and bias trail starts from zero
- handleAlarmTick uses pre-classifyBatch aiClassifications in the discard loop (first tick = cold start → base timeout; second tick onward = prior classifications). Avoids second storage.get call per tick (Pitfall 2)
- lastActiveTabId module-level in index.ts to close prior visit window without extra storage reads
- index.test.ts imports index.ts after vi.mock() calls to prevent top-level ensureOffscreen/ensureHibernateAlarm from throwing in test environment

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

## Verification Results

1. `npm test` — 99 passing, 0 todo, 0 failures (9 files)
2. `grep -c "ensureOffscreen" src/background/index.ts` → 3 (import + comment + invocation)
3. `grep -cE "KEEP_ALIVE|recordKeepAlive" src/background/index.ts` → 4
4. `grep -cE "Vital|Semi-Active|Dead" src/background/hibernation.ts` → 3
5. `grep -c "ai_classifications" src/background/hibernation.ts` → 1
6. `grep -c "ai_install_date" src/background/index.ts` → 2 (install + update branches)

## Known Stubs

None — all Wave 2 deliverables are fully wired with real logic.

## Threat Surface Scan

All T-03-11 through T-03-15 mitigations implemented:
- T-03-11: biasOffset clamped via `Math.min(AI_BIAS_MAX, ...)` in both recordKeepAlive and recordWakeMisclassification; NaN guard applied before addition
- T-03-12: KEEP_ALIVE branch validates `typeof message.tabId === 'number'`, `typeof message.domain === 'string'`, `message.domain.length < 256` before calling recordKeepAlive
- T-03-13: openVisits and openUrls Maps deleted in closeTabVisit synchronously; bounded by open tab count; onRemoved guarantees final cleanup
- T-03-14: recordWakeMisclassification short-circuits when `existing && Date.now() - existing.updatedAt > AI_WAKE_SIGNAL_WINDOW_MS`
- T-03-15: ai_install_date stays in chrome.storage.local only (NFR-04 invariant preserved)

## Self-Check

**Files exist:**
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/background/ai-learning.ts` — FOUND
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/background/hibernation.ts` — FOUND (modified)
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/background/index.ts` — FOUND (modified)

**Commits exist:**
- 37c76ab — Task 1: ai-learning.ts + tests
- 1f20498 — Task 2: hibernation.ts AI integration + tests
- 73ff1aa — Task 3: index.ts SW wiring + tests

## Self-Check: PASSED
