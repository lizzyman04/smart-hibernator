---
phase: 05-polishing-launch
plan: 01
subsystem: offscreen-lifecycle
tags: [memory, ort, offscreen, idle-teardown, race-guard, tdd]
dependency_graph:
  requires: []
  provides: [offscreen-idle-teardown, pending-race-guard, dev-mem-probe]
  affects: [src/background/classifier.ts, src/offscreen/main.ts, src/shared/constants.ts, src/shared/mem-probe.ts]
tech_stack:
  added: []
  patterns: [pending-ref-count, sw-side-setTimeout, release-then-closeDocument, import.meta.env.DEV-gate]
key_files:
  created:
    - src/shared/mem-probe.ts
    - src/shared/mem-probe.test.ts
  modified:
    - src/shared/constants.ts
    - src/offscreen/main.ts
    - src/offscreen/main.test.ts
    - src/background/classifier.ts
    - src/background/classifier.test.ts
decisions:
  - "OFFSCREEN_IDLE_MS = 10 * 60 * 1000 (10 min) — far above 1-min alarm period so actively-classifying browser never tears down between ticks (Pitfall 1 mitigation)"
  - "teardownIfIdle exported for testability with fake timers; armIdleTeardown internal"
  - "pending guard increments before sendMessage, decrements in finally (T-05-01 — even when sendMessage throws)"
  - "RELEASE_SESSION responds ok: true unconditionally — actual RAM reclaim is closeDocument not release()"
  - "RELEASE_SESSION tests placed LAST in main.test.ts to avoid interferring with NFR-03 listener accumulation"
metrics:
  duration: 867s
  completed: "2026-06-22"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 5
---

# Phase 05 Plan 01: Offscreen Idle Teardown + Pending Race Guard + Dev Memory Probe Summary

Implemented D-01/D-05 offscreen document idle teardown lifecycle with in-flight race guard (pending ref-count) and D-02 DEV-gated memory probe, establishing the primary NFR-01 RAM budget lever.

## What Was Built

**Task 1 — OFFSCREEN_IDLE_MS + mem-probe (TDD)**
Added `OFFSCREEN_IDLE_MS = 10 * 60 * 1000` to `src/shared/constants.ts` alongside AI_* constants (D-01 idle window, ~10 min). Created `src/shared/mem-probe.ts` exporting `logMemoryProbe(tag)` gated by `import.meta.env.DEV` + `crossOriginIsolated` + `typeof performance.measureUserAgentSpecificMemory === 'function'`. Never throws; all paths resolve and log to `console.debug` only. Zero probe code in production builds (NFR-04 cleanliness).

**Task 2 — RELEASE_SESSION handler in offscreen/main.ts (TDD)**
Added `RELEASE_SESSION` branch inside the existing single `onMessage.addListener` (top-level-listener invariant preserved). Handler runs async IIFE: `try { if (session) await session.release() } finally { session = null; sessionInit = null }`, then responds `{ ok: true }` unconditionally. Returns literal `true` for Chrome 120 COMP-01 async channel. Nulling both `session` and `sessionInit` ensures a recreated offscreen document re-inits cleanly (T-05-04).

**Task 3 — Idle-teardown timer + pending ref-count in classifier.ts (TDD)**
Added module-level `pending` ref-count and `idleTimer` handle. `armIdleTeardown()` clears prior timer and arms new `setTimeout(OFFSCREEN_IDLE_MS)`. `teardownIfIdle()` (exported for test control): early-returns when `pending > 0` (D-05 correctness requirement / T-05-01), else sends `RELEASE_SESSION` then calls `closeDocument()`, each individually try/catch-swallowed. In `classifyBatch`: `pending++` before `sendMessage`, `pending--` + `armIdleTeardown()` in `finally`. `ensureOffscreen()` is NOT modified — already recreates after teardown via `getContexts()` returning `[]`.

## Test Results

All 47 tests pass across 3 test files:
- `npx vitest run src/background/classifier.test.ts src/offscreen/main.test.ts src/shared`: PASS (47) FAIL (0)
- 6 RED commits followed by 3 GREEN commits (TDD cycle maintained for all 3 tasks)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 094d1c2 | test | Add failing tests for OFFSCREEN_IDLE_MS constant and mem-probe (RED) |
| e809cee | feat | Add OFFSCREEN_IDLE_MS constant and DEV-gated memory probe (GREEN) |
| 7354640 | test | Add failing RELEASE_SESSION tests in offscreen/main.test.ts (RED) |
| 5918c1f | feat | Add RELEASE_SESSION handler to offscreen/main.ts (GREEN) |
| e65f14e | test | Add failing idle-teardown and pending ref-count tests in classifier.test.ts (RED) |
| 5e3773e | feat | Add idle-teardown timer + pending ref-count guard to classifier.ts (GREEN) |

## TDD Gate Compliance

All three tasks followed RED → GREEN cycle:
1. RED gate: Failing tests committed before any implementation
2. GREEN gate: Implementation committed after tests pass
3. No REFACTOR needed (code was clean from initial implementation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test isolation: RELEASE_SESSION describe block interfered with NFR-03 tests**
- **Found during:** Task 2
- **Issue:** When RELEASE_SESSION describe block was placed before NFR-03 describe, `vi.restoreAllMocks()` in afterEach caused NFR-03's `localCreate` to never be called (listener accumulation on shared emitter)
- **Fix:** Moved RELEASE_SESSION describe block to LAST position in main.test.ts, after NFR-03. Added comment explaining the ordering constraint.
- **Files modified:** src/offscreen/main.test.ts
- **Commit:** 5918c1f

**2. [Rule 1 - Bug] Pending guard test needed two-phase unlock**
- **Found during:** Task 3
- **Issue:** Test "teardownIfIdle does NOT call closeDocument when pending > 0" initially called teardownIfIdle before classifyBatch reached the `pending++` step (still awaiting ensureOffscreen/feature-building). pending was 0 when teardownIfIdle ran.
- **Fix:** Added `signalInFlight` promise — the mock `sendMessage` signals when it's called (meaning `pending++` has already run), and the test awaits that signal before calling teardownIfIdle.
- **Files modified:** src/background/classifier.test.ts
- **Commit:** 5e3773e

## Known Stubs

None — all new exports implement real behavior.

## Self-Check: PASSED

All created files verified present. All 6 commits verified in git log. SUMMARY.md written.
