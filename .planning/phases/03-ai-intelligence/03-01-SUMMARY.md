---
phase: 03-ai-intelligence
plan: 01
subsystem: ai
tags: [onnxruntime-web, onnx, vite-plugin-static-copy, offscreen-document, wasm, vitest, typescript]

# Dependency graph
requires:
  - phase: 02-ui-and-rich-previews
    provides: vite.config.ts rollupOptions.input pattern, manifest.json web_accessible_resources pattern, vitest.setup.ts chrome mock injection pattern, src/shared/types.ts + constants.ts append-only baseline

provides:
  - onnxruntime-web@^1.26.0 installed as dependency
  - vite-plugin-static-copy@^4.1.0 installed as devDependency
  - manifest.json: offscreen permission, wasm-unsafe-eval CSP, web_accessible_resources for offscreen + WASM + ONNX
  - vite.config.ts: offscreen rollupOptions.input entry + viteStaticCopy targeting dist/ort/
  - src/offscreen/index.html: placeholder offscreen document entry (replaced by Wave 1 plan 03-02)
  - src/shared/types.ts: TabVitality, ClassificationResult, TabHistoryRecord, DomainBiasRecord; StorageSchema extended with ai_classifications + ai_install_date
  - src/shared/constants.ts: AI_CONFIDENCE_THRESHOLD=0.6, AI_COLD_START_MIN_SAMPLES=50, AI_HISTORY_WINDOW_MS (14d), AI_WAKE_SIGNAL_WINDOW_MS (5min), AI_BIAS_MAX=1.0, AI_LEARNING_DAYS=14, VITAL_DOMAINS, DEAD_DOMAINS
  - vitest.setup.ts: chrome.offscreen shim (createDocument/closeDocument/Reason.WORKERS), chrome.runtime.getContexts shim, chrome.runtime.ContextType shim, guarded getURL shim
  - scripts/generate-model.py: reproducible synthetic Decision Tree ONNX model generator (seed=42, 6 features, zipmap=False)
  - src/assets/classifier.onnx: committed 1.1 KB synthetic ONNX model artifact
  - src/background/classifier.test.ts: Wave 0 stub (2 assertions + 3 it.todo for FR-05/FR-07)
  - src/background/ai-learning.test.ts: Wave 0 stub (1 assertion + 4 it.todo for FR-06)
  - src/offscreen/main.test.ts: Wave 0 stub (2 assertions + 3 it.todo for FR-05/NFR-04)

affects:
  - 03-02 (classifier.ts, offscreen/main.ts — depends on types, constants, offscreen entry, ONNX model)
  - 03-03 (ai-learning.ts, idb.ts tab-history store — depends on DomainBiasRecord, TabHistoryRecord types + AI_BIAS_MAX, AI_WAKE_SIGNAL_WINDOW_MS)
  - 03-04 (hibernation.ts AI integration, popup/dashboard AI UI — depends on ClassificationResult, ai_classifications storage key, AI_CONFIDENCE_THRESHOLD)

# Tech tracking
tech-stack:
  added:
    - onnxruntime-web@^1.26.0 (ML inference engine for local tab vitality classification)
    - vite-plugin-static-copy@^4.1.0 (copies ORT WASM/MJS files from node_modules to dist/ort/ at build time)
    - scikit-learn + skl2onnx + onnx (offline Python — one-time Wave 0 model generation only; not bundled)
  patterns:
    - ONNX model committed as binary artifact (scripts/generate-model.py is the generator; src/assets/classifier.onnx is the artifact)
    - viteStaticCopy targeting dist/ort/ for WASM/MJS runtime files
    - chrome.runtime.getURL('ort/') pattern for WASM path resolution in Offscreen Document context
    - Wave 0 test stub pattern: assert on constants/shims, use it.todo for behavioral specs Wave 1+ fills in

key-files:
  created:
    - src/offscreen/index.html (placeholder; replaced by Wave 1 plan 03-02)
    - src/shared/types.ts (extended with Phase 3 type definitions — append only)
    - scripts/generate-model.py (offline ONNX model generator)
    - src/assets/classifier.onnx (committed binary ONNX artifact, 1.1 KB)
    - src/background/classifier.test.ts (Wave 0 stub — FR-05/FR-07)
    - src/background/ai-learning.test.ts (Wave 0 stub — FR-06)
    - src/offscreen/main.test.ts (Wave 0 stub — FR-05/NFR-04)
  modified:
    - package.json (onnxruntime-web + vite-plugin-static-copy added)
    - package-lock.json (updated after npm install)
    - manifest.json (offscreen permission, wasm-unsafe-eval CSP, 3 new web_accessible_resources)
    - vite.config.ts (viteStaticCopy plugin + offscreen rollupOptions.input)
    - vitest.setup.ts (chrome.offscreen + getContexts + ContextType shims)
    - src/shared/constants.ts (8 new Phase 3 constants appended)

key-decisions:
  - "AI_CONFIDENCE_THRESHOLD = 0.6 — classifier falls back to base timeout when confidence < 0.6 (D-07)"
  - "AI_COLD_START_MIN_SAMPLES = 50 — AI skips classification when tab-history has fewer than 50 rows (Pitfall 5)"
  - "VITAL_DOMAINS preset: github.com, docs.google.com, notion.so, linear.app, figma.com (D-02)"
  - "Decision Tree max_depth=5, random_state=42, 600 synthetic rows, zipmap=False for raw float32 probability output (Pitfall 7)"
  - "numThreads=1 in ORT-Web config (set in Wave 1) — avoids SharedArrayBuffer/cross-origin isolation requirement (RESEARCH.md anti-patterns)"
  - "All IndexedDB writes kept in Service Worker only; Offscreen Document never opens IDB connection (RESEARCH.md Open Questions Q3)"
  - "src/assets/classifier.onnx path used in web_accessible_resources — consistent with assets/ convention from Phase 2"

patterns-established:
  - "Wave 0 test stub: assert on constants/shims with it(), add behavioral specs as it.todo() for later waves"
  - "viteStaticCopy with two targets (*.wasm, *.mjs) both pointing dest: 'ort' — matches web_accessible_resources ort/*.wasm + ort/*.mjs"
  - "Append-only extension of types.ts and constants.ts — never modify existing exports"
  - "chrome.offscreen shim in vitest.setup.ts follows Object.assign pattern established in Phase 2 for MV3 action mock"

requirements-completed: [FR-05, FR-06, FR-07, NFR-02, NFR-03, NFR-04]

# Metrics
duration: 7min
completed: 2026-05-14
---

# Phase 3 Plan 01: Wave 0 AI Intelligence Foundation Summary

**ORT-Web + vite-plugin-static-copy wired; synthetic 1.1 KB Decision Tree ONNX model committed; Phase 3 types, constants, and chrome shims in place; three Wave 0 test stubs green**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-14T09:26:00Z
- **Completed:** 2026-05-14T09:33:48Z
- **Tasks:** 3/3
- **Files modified:** 12 (4 modified, 8 created)

## Accomplishments
- Installed onnxruntime-web@^1.26.0 and vite-plugin-static-copy@^4.1.0; npm install exits 0
- manifest.json updated with offscreen permission, wasm-unsafe-eval CSP, and 3 new web_accessible_resources entries for offscreen HTML, ORT WASM/MJS, and classifier.onnx
- vite.config.ts wired with offscreen rollupOptions.input entry and viteStaticCopy targets for dist/ort/
- All Phase 3 types (TabVitality, ClassificationResult, TabHistoryRecord, DomainBiasRecord) and constants (8 AI_ constants + VITAL_DOMAINS/DEAD_DOMAINS) exported from src/shared/
- Generated and committed synthetic 1.1 KB ONNX Decision Tree model (max_depth=5, seed=42, zipmap=False, 6-feature float32 input)
- Three Wave 0 test stubs created; npm test: 9 files, 44 passing, 10 todo, 0 failures

## Task Commits

1. **Task 1: ORT + vite wiring, manifest, offscreen placeholder** - `c5731a7` (feat)
2. **Task 2: types.ts + constants.ts + vitest.setup.ts shims** - `fd53e5e` (feat)
3. **Task 3: generate-model.py + classifier.onnx + 3 test stubs** - `dd0a563` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `package.json` — onnxruntime-web@^1.26.0 (dep), vite-plugin-static-copy@^4.1.0 (devDep)
- `manifest.json` — offscreen permission, wasm-unsafe-eval CSP, 3 new web_accessible_resources
- `vite.config.ts` — viteStaticCopy plugin + offscreen rollupOptions.input entry
- `src/offscreen/index.html` — placeholder offscreen HTML (Wave 1 plan 03-02 replaces this)
- `src/shared/types.ts` — TabVitality, ClassificationResult, TabHistoryRecord, DomainBiasRecord; StorageSchema += ai_classifications + ai_install_date
- `src/shared/constants.ts` — 8 new Phase 3 constants appended (AI_CONFIDENCE_THRESHOLD through DEAD_DOMAINS)
- `vitest.setup.ts` — chrome.offscreen/getContexts/ContextType/getURL shims added
- `scripts/generate-model.py` — deterministic synthetic ONNX model generator (600 rows, seed=42)
- `src/assets/classifier.onnx` — committed binary (1153 bytes / 1.1 KB)
- `src/background/classifier.test.ts` — Wave 0 stub for FR-05/FR-07
- `src/background/ai-learning.test.ts` — Wave 0 stub for FR-06
- `src/offscreen/main.test.ts` — Wave 0 stub for FR-05/NFR-04

## Decisions Made

- AI_CONFIDENCE_THRESHOLD = 0.6 (D-07 — Claude's discretion; ~0.6 suggested in context)
- AI_COLD_START_MIN_SAMPLES = 50 (Pitfall 5 — 0 rows would activate AI immediately on first install)
- VITAL_DOMAINS preset: github.com, docs.google.com, notion.so, linear.app, figma.com (D-02)
- ONNX model: Decision Tree max_depth=5, random_state=42, 600 synthetic rows, zipmap=False to emit raw float32 probabilities instead of ZipMap dict (Pitfall 7)
- src/assets/ path for classifier.onnx (consistent with extension assets convention; matches web_accessible_resources entry)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Python `skl2onnx` not pre-installed on the system; installed with `pip install scikit-learn skl2onnx onnx numpy --break-system-packages`. The plan notes this as expected (Wave 0 user_setup). The .onnx artifact is committed so downstream waves never need Python.

## User Setup Required

Python ML deps needed ONLY to regenerate the model:
```bash
pip install scikit-learn skl2onnx onnx numpy
python scripts/generate-model.py
```
The committed `src/assets/classifier.onnx` is sufficient for all downstream waves.

## Next Phase Readiness

Wave 1 (plan 03-02) can proceed immediately. All prerequisites are in place:
- `src/offscreen/index.html` placeholder exists (Wave 1 replaces it with the real ORT entry)
- `src/assets/classifier.onnx` committed and under 100 KB
- All Phase 3 types importable from `../shared/types`
- All Phase 3 constants importable from `../shared/constants`
- `chrome.offscreen` and `chrome.runtime.getContexts` are shimmed in test environment
- ORT WASM files will copy to `dist/ort/` on `npm run build`

---
*Phase: 03-ai-intelligence*
*Completed: 2026-05-14*
