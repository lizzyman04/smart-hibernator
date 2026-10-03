---
phase: 05-polishing-launch
plan: 06
subsystem: background-ai-lifecycle
tags: [offscreen-document, chrome-alarms, service-worker, nfr-01, gap-closure, onnx]
gap_closure: true
gap_ids: [G-05-1]

requires:
  - phase: 05-polishing-launch
    provides: "05-01 offscreen idle teardown + pending guard, 05-02/05-03/05-05 runbook, permissions and store listing docs"
provides:
  - "Freshness-gated classifyBatch: inference and offscreen creation only when a candidate is stale"
  - "chrome.alarms-scheduled (SW-suspension-proof) offscreen idle teardown routed from index.ts"
  - "No offscreen creation at SW boot or on cold-start ticks"
  - "End-to-end regression suite for G-05-1 incl. simulated SW restart"
  - "NFR-01 runbook, PERMISSIONS.md and STORE-LISTING.md aligned with the shipped lifecycle"
affects: [05-polishing-launch verification, /gsd-verify-work UAT test 1 re-run, CWS submission]

actuals:
  tokens: 12000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Freshness gate at the lifecycle chokepoint (classifier.ts), hibernation.ts untouched"
    - "One-shot chrome.alarms alarm for work that must survive SW suspension"
    - "Simulated SW restart in tests: reset module registry, clear listeners and timers, keep storage/alarms/doc state"

key-files:
  created:
    - src/background/offscreen-idle.test.ts
  modified:
    - src/background/classifier.ts
    - src/background/classifier.test.ts
    - src/background/index.ts
    - src/background/index.test.ts
    - src/shared/constants.ts
    - src/shared/types.ts
    - docs/MEMORY-RUNBOOK.md
    - PERMISSIONS.md
    - docs/STORE-LISTING.md

key-decisions:
  - "AI_CLASSIFICATION_TTL_MS = 60 min: must exceed OFFSCREEN_IDLE_MS (10 min) so an idle browser reaches teardown and stays down; bounds drift of the excluded features (revisitFreq, dwellTime, recency). During long idle the document lives about 10 min per 60 min. Claude's discretion under D-01."
  - "featureKey covers only event-driven inputs (hostname, form activity, category boost, bias); drifting features are excluded so they cannot recreate per-tick bursts."
  - "One stale candidate re-infers the whole batch, keeping inferredAt aligned and TTL refreshes as a single burst."
  - "Idle teardown moved from an in-memory SW setTimeout to a one-shot chrome.alarms alarm, superseding the 05-RESEARCH.md anti-pattern; the pending guard plus the burst's finally re-arm neutralize mid-burst firing."
  - "cachedAt keeps refreshing every tick for fresh candidates (Phase 3 wake-misclassification window); inferredAt tracks the real inference time."

patterns-established:
  - "Lifecycle code stays in classifier.ts; index.ts only routes the alarm to teardownIfIdle"

requirements-completed: [NFR-01]

coverage:
  - id: D1
    description: "Root cause of G-05-1 reproduced by failing regression tests before any fix (per-tick CLASSIFY_BATCH, lost SW timer, boot-time createDocument)"
    requirement: NFR-01
    verification:
      - kind: integration
        ref: "src/background/offscreen-idle.test.ts#G-05-1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Idle browser past cold start sends one CLASSIFY_BATCH, then tears the document down at or after OFFSCREEN_IDLE_MS and keeps it down, including across a SW restart; activity recreates it on demand"
    requirement: NFR-01
    verification:
      - kind: integration
        ref: "src/background/offscreen-idle.test.ts"
        status: pass
      - kind: unit
        ref: "src/background/classifier.test.ts#classifyBatch freshness gate (G-05-1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No offscreen creation at SW boot; alarm routed to teardownIfIdle; teardown never closes mid-burst"
    requirement: NFR-01
    verification:
      - kind: unit
        ref: "src/background/index.test.ts#offscreen lifecycle wiring (G-05-1)"
        status: pass
      - kind: unit
        ref: "src/background/classifier.test.ts#D-05 (G-05-1): pending spans ensureOffscreen"
        status: pass
    human_judgment: false
  - id: D4
    description: "Runbook, PERMISSIONS.md and STORE-LISTING.md describe the alarm-scheduled lifecycle and second use of alarms"
    requirement: NFR-01
    verification:
      - kind: other
        ref: "grep gates in 05-06-PLAN.md Task 3 verify (DOCS_OK)"
        status: pass
    human_judgment: false
  - id: D5
    description: "NFR-01 gate re-run in a real browser (offscreen target absent at 12 and 13 idle minutes, recreated after a tab switch)"
    verification: []
    human_judgment: true
    rationale: "Real Chrome Task Manager / CDP measurement; run by /gsd-verify-work per the runbook or uat-evidence/nfr01-run.mjs. G-05-1 is closed only when that passes."

duration: 75min
completed: 2026-10-03
plan_head_before: 93d090d253265a399e15c8f27fb0036a1ca9b64e
commits: 5
status: complete
---

# Phase 5 Plan 06: G-05-1 Offscreen Idle Teardown Fix Summary

**Freshness-gated classification plus a chrome.alarms one-shot teardown, so an idle browser past cold start sends one CLASSIFY_BATCH, closes the offscreen document 10 minutes later, survives SW restarts, and never recreates it at boot.**

## Performance

- **Duration:** about 75 min
- **Completed:** 2026-10-03
- **Tasks:** 3 of 3
- **Files modified:** 10 (1 created)
- **Baseline to final tests:** 226 tests / 13 files to 254 tests / 14 files, all green (3 consecutive full runs)

## Root cause confirmation (G-05-1)

Task 1 RED, run against unmodified code: 48 background http tabs plus 1 active tab, countTabHistory 60, one tick at t0 followed by 13 one-minute idle ticks.

- CLASSIFY_BATCH sends: **14** (expected 1), one per tick. The first assertion failed with `expected 14 to be 1`.
- closeDocument calls: **0** (expected 1). The "activity resumes" scenario runs the same 13-minute sequence and failed with `expected +0 to be 1`.
- `inferredAt` on the stored entry: `undefined` (field did not exist yet).

Both predicted numbers matched (send count equals tick count, closeDocument 0). Verdict: **diagnosis confirmed**. `classifyBatch`'s finally re-armed the 10-minute timer on every tick, so it could never elapse.

## Root cause confirmation (G-05-1, SW lifetime)

Task 2 RED, run against the Task 1 code with a simulated alarm scheduler, `bootSw()` and `simulateSwRestart()`:

- SW restart after a burst at t0, then 11 idle minutes: closeDocument calls **0** (expected 1). The in-memory timer dies with the SW.
- SW boot (fresh import of `./index`, document closed): `createDocument` called **1** time (expected 0), and `getContexts` called. This is the index.ts warm-up.

Both predictions matched. Verdict: **confirmed**.

## Accomplishments

- `classifyBatch` now reads the cache first, builds features (cold start returns before any offscreen work), and runs a burst only when `isClassificationStale` flags a candidate. A fresh batch only refreshes `cachedAt`.
- `armIdleTeardown` creates the one-shot `OFFSCREEN_IDLE_TEARDOWN` alarm (same name replaces the pending one); `ensureOffscreen` arms it on document creation; `index.ts` routes it to `teardownIfIdle`.
- `pending` now spans `ensureOffscreen()` plus the CLASSIFY_BATCH round-trip (D-05); the boot-time `ensureOffscreen()` call is gone (D-01 recreate-on-demand).
- Docs: runbook gains a cold-start precondition with a seeding snippet, alarm-based teardown wording, the SW-console `chrome.alarms.get` tip, and new triage rows; `alarms` justification updated in PERMISSIONS.md and STORE-LISTING.md.

## Task Commits

1. **Task 1 Step 1 (RED):** `3d963ca` test(05-06): add failing G-05-1 idle-teardown regression
2. **Task 1 (GREEN):** `f4979c1` feat(05-06): skip redundant classification so idle offscreen teardown can elapse (G-05-1)
3. **Task 2 Step 1 (RED):** `8ccf450` test(05-06): add failing SW-restart and boot regressions for offscreen teardown
4. **Task 2 (GREEN):** `5a2b58a` feat(05-06): schedule offscreen idle teardown via chrome.alarms and drop boot warm-up (G-05-1)
5. **Task 3:** `bbd77e3` docs(05-06): update NFR-01 runbook and alarms justification for alarm-scheduled offscreen teardown

**Plan metadata:** committed separately with this SUMMARY.

## Files Created/Modified

- `src/background/offscreen-idle.test.ts` - end-to-end G-05-1 regressions (real handleAlarmTick, classifyBatch and index.ts routing, simulated SW restart and boot)
- `src/background/classifier.ts` - `classificationFeatureKey`, `isClassificationStale`, burst-only `ensureOffscreen`, alarm-scheduled teardown
- `src/background/classifier.test.ts` - freshness, key, constants, alarm and pending-span unit tests; old SW-timer test replaced
- `src/background/index.ts` / `index.test.ts` - alarm routing, boot warm-up removed, wiring tests
- `src/shared/constants.ts` - `AI_CLASSIFICATION_TTL_MS`, `OFFSCREEN_IDLE_ALARM`
- `src/shared/types.ts` - optional `inferredAt` and `featureKey` on `ClassificationResult`
- `docs/MEMORY-RUNBOOK.md`, `PERMISSIONS.md`, `docs/STORE-LISTING.md` - lifecycle and permission documentation

## Decisions Made

See `key-decisions` in the frontmatter. The TTL of 60 minutes was chosen because it must exceed the 10-minute idle window (asserted by a test) and because the excluded features drift slowly (14-day history, hours-scale recency), so an hour is an acceptable staleness bound against one extra 10-minute document lifetime per hour of idle.

Accepted consequence (documented in the plan's success criteria): between refreshes a cached label, and any discard decision reading it, can be up to 60 minutes stale with respect to the drifting features.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Protected-branch commit guard halted execution on `main`**
- **Found during:** Task 1 Step 1 commit
- **Issue:** HEAD was on `main`, which the pre-commit assertion treats as protected; no override was configured.
- **Fix:** Halted and returned a decision checkpoint. The coordinator chose to commit on a new branch `gsd/phase-05-polishing-launch`; config untouched. All five task commits live on that branch.
- **Committed in:** n/a (process)

**2. [Rule 1 - Bug] Harness defect: `vi.clearAllTimers()` resets the fake clock**
- **Found during:** Task 2 Step 1 (simulateSwRestart)
- **Issue:** after the simulated restart `Date.now()` jumped back to real time, giving a bogus closeDocument timestamp.
- **Fix:** `simulateSwRestart` saves `Date.now()` and restores it with `vi.setSystemTime` after clearing timers. A test fix, not a refutation of the prediction.
- **Files modified:** `src/background/offscreen-idle.test.ts`
- **Committed in:** `8ccf450`

**3. [Rule 1 - Bug] Test fixture error in the "fully fresh cache" unit test**
- **Found during:** Task 1 Step 4
- **Issue:** fixture `lastActiveAt` (10 s ago) was later than `inferredAt` (5 min ago), so the entry was correctly stale.
- **Fix:** fixtures use `lastActiveAt = now - 10 min`.
- **Committed in:** `f4979c1`

**4. [Environment] `npx vite build` unusable; used `npm run build`**
- **Issue:** under the rtk wrapper `npx vite build` fails with "Missing script: vite". `npm run build` runs the same `vite build` and succeeded; `dist/assets/constants-*.js` and `index.ts-*.js` contain `OFFSCREEN_IDLE_TEARDOWN`.

---

**Total deviations:** 3 auto-fixed (1 process, 2 test-only bugs) plus 1 environment note.
**Impact on plan:** none on product code; no scope creep.

## Issues Encountered

- One full `npx vitest run` printed a stack trace pointing at `src/dashboard/App.test.tsx:51` alongside a summary I could not fully read. Three consecutive follow-up full runs were clean (254/254, 14 files) and the trace never recurred. That file is not touched by this plan; treated as unrelated intermittent noise and not investigated further.
- `tsc --noEmit` was not used as a gate (pre-existing TS 6 config breakage, per the plan).

## Known Stubs

None.

## Threat Flags

None. The only new surface is the extension-internal `OFFSCREEN_IDLE_TEARDOWN` alarm, already covered by T-05-06-06.

## Deferred / Out of scope

- UAT test 2 (cross-OS screenshots): blocked on Windows/macOS hardware.
- Closing gate for G-05-1 is the real-browser re-run of UAT test 1 (`/gsd-verify-work`), not performed by this plan. 05-HUMAN-UAT.md was not edited.

## Self-Check: PASSED
