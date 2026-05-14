---
phase: 03-ai-intelligence
plan: 02
subsystem: ai
tags: [onnxruntime-web, offscreen-document, indexeddb, classifier, feature-vector, wasm, vitest]

# Dependency graph
requires:
  - phase: 03-ai-intelligence
    plan: 01
    provides: onnxruntime-web installed, classifier.onnx artifact, Phase 3 types + constants, vitest.setup.ts shims, Wave 0 test stubs

provides:
  - src/offscreen/index.html: real Offscreen Document entry (loads main.ts as ES module; no #root, no CSS)
  - src/offscreen/main.ts: ORT-Web session singleton (WebGPU/WASM detection), CLASSIFY_BATCH handler, top-level listener, DOMContentLoaded warm-up
  - src/background/classifier.ts: getDomainCategoryBoost, buildFeaturesForTab, ensureOffscreen, classifyBatch
  - src/background/idb.ts (v2): tab-history + domain-bias stores, 6 new CRUD helpers, blocked/blocking callbacks

affects:
  - 03-03 (ai-learning.ts depends on appendTabHistory, getDomainBias, putDomainBias from idb.ts v2)
  - 03-04 (hibernation.ts AI integration reads from ai_classifications storage key set by classifyBatch)
  - popup/dashboard Wave (reads ai_classifications for V/S/D badge rendering)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - vi.hoisted() for sharing mock references between vi.mock() factory and test bodies
    - vi.doMock() + vi.resetModules() + dynamic import() for per-test module graph isolation (NFR-03 navigator.gpu tests)
    - vitest-chrome callListeners() for triggering onMessage listeners without vi.fn() spy on addListener
    - IDB upgrade with upgrade(db, oldVersion) multi-version callback (Pitfall 3 / T-03-10)
    - Module-level promise guard (creatingOffscreen) for concurrent ensureOffscreen calls (Pitfall 2 / T-03-09)

key-files:
  created:
    - src/offscreen/main.ts (ORT-Web session + CLASSIFY_BATCH handler)
    - src/background/classifier.ts (feature vector, offscreen lifecycle, batch classify)
  modified:
    - src/offscreen/index.html (replaced placeholder with real entry)
    - src/background/idb.ts (DB v1 → v2, tab-history + domain-bias stores + 6 CRUD helpers)
    - src/offscreen/main.test.ts (Wave 0 stubs → 9 real behavioral tests)
    - src/background/idb.test.ts (appended tab-history CRUD + domain-bias CRUD describe blocks)
    - src/background/classifier.test.ts (Wave 0 stubs → 20 real behavioral tests)

key-decisions:
  - "vi.hoisted() is the vitest-idiomatic way to share mocks between vi.mock() factory and test code — avoids the 'variable is not defined' hoisting error"
  - "vitest-chrome onMessage.addListener is a real event emitter (not vi.fn()) — use callListeners() to trigger registered listeners in tests"
  - "Session reuse test asserts that create is not called again on second dispatch, not that it was called exactly once, because vi.clearAllMocks() resets call history between tests while module singleton persists"
  - "classifier.ts imports AI_COLD_START_MIN_SAMPLES, AI_HISTORY_WINDOW_MS, VITAL_DOMAINS, DEAD_DOMAINS from constants (not AI_CONFIDENCE_THRESHOLD — classifyBatch does not apply threshold; hibernation.ts will apply it in Wave 3)"
  - "LABEL_ORDER = ['Dead','Semi-Active','Vital'] matching skl2onnx training label order (0=Dead,1=Semi-Active,2=Vital)"

# Metrics
duration: 25min
completed: 2026-05-14
---

# Phase 3 Plan 02: Wave 1 AI Inference Engine and Data Store Summary

**Offscreen Document ORT-Web session wired; classifier.ts feature vector + batch classify; IDB v2 tab-history + domain-bias stores; 76 tests passing (was 44)**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-05-14
- **Tasks:** 3/3
- **Tests:** 76 passing, 4 todo (was 44 passing, 10 todo — net +32 real tests, -6 todos resolved)
- **Files created:** 2, modified: 5

## Accomplishments

- Extended idb.ts to DB version 2: tab-history store (by-domain + by-timestamp indexes) + domain-bias store; added blocked()/blocking() callbacks per Pitfall 3 / T-03-10
- Added 6 new CRUD exports: appendTabHistory, getTabHistoryByDomain, countTabHistory, pruneTabHistory, getDomainBias, putDomainBias
- Replaced offscreen/index.html placeholder with real entry (no #root, no CSS, just `<script type="module" src="./main.ts">`)
- Created offscreen/main.ts: ORT-Web WASM-only import, module-level session singleton (getSession), wasmPaths + numThreads=1 configured before session creation, WebGPU probe via navigator.gpu, LABEL_ORDER = ['Dead','Semi-Active','Vital'], features.length===6 validation gate (T-03-08), top-level onMessage listener, DOMContentLoaded warm-up
- Created classifier.ts: getDomainCategoryBoost (D-02 heuristics), buildFeaturesForTab (6-element vector, cold-start gate, bias clamping T-03-07), ensureOffscreen (getContexts + creatingOffscreen promise guard T-03-09), classifyBatch (ensureOffscreen + CLASSIFY_BATCH message + prune stale tabIds T-03-06 + storage write)
- All three test stubs expanded to real behavioral tests (9 offscreen + 20 classifier + 13 idb new)

## Task Commits

1. **Task 1: idb.ts DB v2 + tab-history/domain-bias stores + tests** — `0253082`
2. **Task 2: offscreen/main.ts + index.html + main.test.ts** — `906eed4`
3. **Task 3: classifier.ts + classifier.test.ts** — `dd7af10`

## Files Created/Modified

- `src/background/idb.ts` — bumped to v2; tab-history + domain-bias stores; 6 new CRUD exports; blocked/blocking callbacks
- `src/background/idb.test.ts` — appended tab-history CRUD (4 tests) + domain-bias CRUD (3 tests)
- `src/offscreen/index.html` — replaced placeholder with real ES module entry
- `src/offscreen/main.ts` — created: ORT session singleton, CLASSIFY_BATCH handler, NFR-03 WebGPU probe
- `src/offscreen/main.test.ts` — replaced Wave 0 todos with 9 behavioral tests (FR-05, NFR-03, NFR-04)
- `src/background/classifier.ts` — created: getDomainCategoryBoost, buildFeaturesForTab, ensureOffscreen, classifyBatch
- `src/background/classifier.test.ts` — replaced Wave 0 todos with 20 behavioral tests (FR-05, FR-07, T-03-06/07/09)

## Decisions Made

- vi.hoisted() + vi.doMock() pattern for test isolation — avoids hoisting errors with shared mock references across vi.mock() factory and test bodies
- vitest-chrome callListeners() used instead of spy on addListener (real event emitter, not vi.fn())
- Session reuse test uses "no additional create calls on second dispatch" assertion rather than "exactly 1 create call" to survive vi.clearAllMocks() between tests while module-level session singleton persists
- LABEL_ORDER = ['Dead','Semi-Active','Vital'] confirmed matching skl2onnx training label order 0,1,2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.mock() hoisting variable-not-defined error in main.test.ts**
- **Found during:** Task 2 — first test run
- **Issue:** vi.mock() calls inside describe blocks with local variable references (e.g. `createMock`) are hoisted to file top by vitest, where those variables don't exist yet, causing "ReferenceError: createMock is not defined"
- **Fix:** Used vi.hoisted() to declare shared mock variables before the top-level vi.mock() factory, and vi.doMock() (non-hoisted) inside NFR-03 tests that need per-test module resets
- **Files modified:** src/offscreen/main.test.ts
- **Commit:** 906eed4

**2. [Rule 1 - Bug] Fixed session reuse test assertion after vi.clearAllMocks()**
- **Found during:** Task 2 — second test run iteration
- **Issue:** The "getSession reuses the same InferenceSession across multiple classify calls" test asserted `createMock.mock.calls.length === 1` but vi.clearAllMocks() in beforeEach resets call history while the module-level session singleton persists, so `createMock` shows 0 calls in subsequent tests
- **Fix:** Changed assertion to verify the second dispatch doesn't increment the createMock call count (no new create on second dispatch), which correctly validates session reuse regardless of prior test state
- **Files modified:** src/offscreen/main.test.ts
- **Commit:** 906eed4

## Verification Results

1. `npm test` — 76 passing, 4 todo, 0 failures (9 files)
2. NFR-04 grep gate — `grep -rE "fetch\\(['\"]http" src/offscreen src/background/classifier.ts` returns zero matches
3. idb CRUD helpers — `grep -cE "appendTabHistory|getTabHistoryByDomain|countTabHistory|pruneTabHistory|getDomainBias|putDomainBias" src/background/idb.ts` returns 6
4. CLASSIFY_BATCH — appears in both offscreen/main.ts and classifier.ts (>= 2 total)
5. ai_classifications — appears >= 1 time in classifier.ts
6. NFR-03 behavioral assertions — 2 tests in main.test.ts: truthy navigator.gpu → executionProviders contains 'webgpu'; falsy → ['wasm']

## Known Stubs

None — all Wave 1 deliverables are fully wired with real logic.

## Threat Surface Scan

No new trust boundaries introduced beyond the plan's threat model. All T-03-05 through T-03-10 mitigations implemented:
- T-03-05: NFR-04 fetch URL check verified by test and grep gate
- T-03-06: classifyBatch prunes stale tabIds via chrome.tabs.query
- T-03-07: domainBiasOffset clamped to [-1,1] + NaN guard in buildFeaturesForTab
- T-03-08: features.length===6 validation in offscreen handler
- T-03-09: creatingOffscreen promise guard in ensureOffscreen
- T-03-10: blocked()/blocking() callbacks in idb.ts getDb()

## Self-Check

**Files exist:**
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/offscreen/main.ts` — FOUND
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/background/classifier.ts` — FOUND

**Commits exist:**
- 0253082 — idb.ts Task 1
- 906eed4 — offscreen Task 2
- dd7af10 — classifier Task 3

## Self-Check: PASSED
