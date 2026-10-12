---
phase: 05-polishing-launch
verified: 2026-10-12T07:30:00Z
status: human_needed
score: 10/13 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - "PERMISSIONS.md"
  - "docs/MEMORY-RUNBOOK.md"
  - "docs/STORE-LISTING.md"
  - "manifest.json"
  - "src/background/classifier.test.ts"
  - "src/background/classifier.ts"
  - "src/background/index.test.ts"
  - "src/background/index.ts"
  - "src/background/offscreen-idle.test.ts"
  - "src/shared/constants.ts"
  - "src/shared/types.ts"
  - "vite.config.ts"
covered_digest: "v1:sha256:3f19dbec7a15d24e7fc02ecc15f88edfe0b1f3547361852b4926dde9514bebf2"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 10/11
  gaps_closed:
    - "G-05-1 (code level, 05-06): per-tick re-arm of teardown removed, SW-suspension-proof alarm teardown added, boot warm-up removed"
    - "G-05-1 (real root cause, 4238514): ORT wasm/mjs copied to dist/ort/node_modules/onnxruntime-web/dist/ while offscreen loads from ort/, so session init failed on every batch; static-copy now flattens to dist/ort/ (confirmed in a fresh build)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "classifier.ts empty-batch fallback (4238514) caches null-label rows with inferredAt=now when CLASSIFY_BATCH resolves with empty/undefined results. No unit test and no real-browser run exercises this branch (post-fix runs had a working session). A transient whole-batch failure now suppresses re-inference for those tabs until a tab activation, a featureKey change, or the 60 min TTL."
    category: other
    reason: "Untested behavior change. Code trace is sound (next tick: entry present, inferredAt fresh, featureKey equal, so not stale and no burst), but behavior is unexercised."
    evidence_status: "none provided"
  - finding: "Residual G-05-1-shaped path: if chrome.runtime.sendMessage REJECTS (no receiver, e.g. offscreen script fails to load, or createDocument rejects), the exception propagates past the finally (which re-arms the alarm) to the outer catch; nothing is cached, so each tick re-bursts and re-arms the idle alarm. The 4238514 fix covers only the resolved-empty case (the offscreen catch -> sendResponse({results: []}) path)."
    category: other
    reason: "Narrow failure mode (offscreen document present but without a listener, or creation failing); not the observed UAT failure. Worth a follow-up, not a blocker."
    evidence_status: "none provided"
  - finding: "No automated guard that dist/ort stays flat. Phase 3 verification marked the static-copy target VERIFIED at config level, but the nested output path meant inference never worked in a real build until 4238514. Vitest does not build, so a regression of vite.config.ts would pass the 254-test suite."
    category: other
    reason: "Process gap: config-level verification missed a real-build defect. Consider a post-build assertion in scripts/package.mjs or a build smoke test."
    evidence_status: "none provided"
behavior_unverified_items:
  - truth: "A whole-batch CLASSIFY_BATCH failure (empty or undefined results) does not cause a re-burst and idle-alarm re-arm on every 1-min tick"
    test: "In a real browser, force offscreen session init to fail (for example temporarily remove one ort/*.wasm from dist/), load with >= 50 tab-history rows and a few background tabs, then watch chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN') and ai_classifications across 12+ minutes. Or add a classifier.test.ts case: sendMessage resolves { results: [] } then undefined, run two classifyBatch calls, assert the second performs no CLASSIFY_BATCH/createDocument and cache rows have label null."
    expected: "First batch writes null-label rows with inferredAt set; subsequent ticks send no CLASSIFY_BATCH, do not re-arm the alarm, and the document is torn down at about +10 min."
    why_human: "Branch added in 4238514 with no unit test and no real-browser exercise; grep and code reading prove presence, not the cleanup/ordering behavior."
human_verification:
  - test: "NFR-01 memory gate of record in Chrome Task Manager (UAT test 1, remaining half)"
    expected: "On real Chrome stable (Windows or macOS preferred; Linux acceptable), following docs/MEMORY-RUNBOOK.md: ~50 tabs, >= 50 tab-history rows seeded, warm reading, idle >= 12 min. Offscreen Document absent at 12 and 13 idle minutes, total extension memory in Chrome Task Manager < 45 MB after teardown, document recreated cleanly after a tab switch."
    why_human: "The Playwright run measured /proc RSS/PSS of a renderer process shared by SW and offscreen (135 MB RSS / 25 PSS idle; 157.8 / 49.6 warm; 187.7 / 77.6 after recreate). Those numbers are not comparable to the Task Manager footprint number, so the 45 MB gate has no valid reading yet. Note the recreated-document PSS (77.6 MB) exceeds warm PSS; whether that is harness noise (49 live pages) or real peak footprint during active inference is unresolved. Success criterion 1 says 'even with multiple models loaded'; the gate is currently defined post-teardown."
  - test: "Re-check the 49-tab 12-minute presence anomaly"
    expected: "Re-run nfr01-rerun.mjs with per-minute alarms.get('OFFSCREEN_IDLE_TEARDOWN') and inferredAt logging (as in nfr01-diag-fixed2.log). If the offscreen doc is present at idle 12 min, the logs should show a late burst (tab load/navigation or tab activation) that moved the alarm; teardown should follow ~10 min after the last burst."
    why_human: "nfr01-rerun2.log (49 tabs) recorded the doc present at 12 min, absent at 13 min, with only target lists (no alarm/inferredAt telemetry). The late-re-inference explanation is plausible given isClassificationStale re-infers on any tab activation or featureKey change, but is unconfirmed. An untracked earlier run (nfr01-diag-fixed.log, 10 tabs) also shows a re-burst at t+10 min (inferred age reset to 20 s, alarm back to 580 s) before the harness browser closed, which supports the hypothesis but also shows teardown can be deferred indefinitely under steady tab churn."
  - test: "Cross-OS UI screenshot pass on Windows and macOS (COMP-02 / UAT test 2)"
    expected: "Per docs/CROSS-OS-SCREENSHOTS.md: popup (hibernated + empty) and dashboard (Stats + Settings) show thin scrollbars (no Windows fat native bars), Geist to system-ui font fallback, no native-control divergence. Linux already passed (uat-evidence/linux-*.png)."
    why_human: "Requires physical Windows/macOS hardware; UAT test 2 is blocked_by physical-device. Linux popup 'hibernated tabs' state was also not captured."
---

# Phase 05: Polishing & Launch Verification Report

**Phase Goal:** Maximize stability, minimize resource footprint, and prepare for public release.
**Success Criteria (ROADMAP):**
1. Total extension memory footprint stays below 45MB even with multiple models loaded.
2. UI is fully responsive and consistent across Windows, macOS, and Linux.
3. All extension permissions are verified as the absolute minimum required for functionality.

**Verified:** 2026-10-12T07:30:00Z
**Status:** human_needed
**Re-verification:** Yes. Prior report (2026-10-03) was human_needed after plan 05-06. Since then the real-browser UAT found 05-06 alone did not fix G-05-1; commits 4238514 (ORT path flatten + empty-batch caching) and 22c0cad (UAT evidence) landed.

## Goal Achievement

### What changed since the last verification

| Commit | Change | Independently verified |
|--------|--------|------------------------|
| 4238514 | `vite.config.ts`: `rename: { stripBase: true }` on both static-copy targets; `classifier.ts`: whole-batch-empty result now caches null-label rows | Yes (below) |
| 22c0cad | UAT evidence + 05-HUMAN-UAT.md test 1 -> pass with caveats | Logs read; claims match raw data |

The earlier 05-06 mechanism (freshness gate, alarm-based teardown, no boot warm-up) was necessary but not sufficient: with ORT assets mis-located, session init failed, every `CLASSIFY_BATCH` returned `{results: []}`, `classifyBatch` returned before writing the cache, and the freshness gate therefore saw every tab as stale on every tick. The 05-06 simulated tests all mocked a healthy offscreen, so they could not see this. nfr01-diag.log (pre-fix) confirms it: alarm pinned at `OFFSCREEN_IDLE_TEARDOWN@580s` for 14 minutes, `"n":0` cache entries.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Offscreen document is torn down after a sustained idle window with no classification in flight | VERIFIED | Simulated: `offscreen-idle.test.ts` (48 tabs, 13 idle min: 1 CLASSIFY_BATCH, 1 create, 1 close). Real browser (Playwright Chromium 147, Linux): `nfr01-diag-fixed2.log` doc created at t+1m, alarm counts down 581s -> 40s, `off:0` from t+11m through t+24m, cache `n:9` with Vital/Dead labels, `inferred` age grows monotonically (no re-burst). Caveats: not Task Manager, single machine. |
| 2 | Idle teardown never fires while a CLASSIFY_BATCH is in flight | VERIFIED | `pending` guard in `teardownIfIdle`; `pending++` spans `ensureOffscreen()` + sendMessage (`classifier.ts:277-292`); classifier.test.ts parked-createDocument test passes |
| 3 | The next burst after teardown transparently recreates the document | VERIFIED | Simulated activity-resumes test; real browser: `nfr01-rerun2.log` `RECREATED` target list shows `background_page:src/offscreen/index.html` after tab switch |
| 4 | Teardown survives service-worker restart | VERIFIED (simulated) | `offscreen-idle.test.ts` SW-restart scenario; alarm is `chrome.alarms.create({when})`, not a SW timer. Real SW suspension not separately exercised. |
| 5 | SW boot never creates the offscreen document | VERIFIED | grep of non-test `src/`: `ensureOffscreen` is called only at `classifier.ts:284` (inside `classifyBatch`); `createDocument` only at `classifier.ts:218`; `index.ts` has no reference. Test "importing index.ts never creates the offscreen document" passes |
| 6 | RELEASE_SESSION releases ORT session and nulls both singletons | VERIFIED | `offscreen/main.ts` RELEASE_SESSION handler (unchanged; regression check) |
| 7 | ORT wasm/mjs assets ship flat at `dist/ort/` and offscreen session init succeeds in a real build | VERIFIED | I ran a fresh `vite build` to a scratch outDir: `ort/` has 0 subdirectories, 26 flat files, 4 `.wasm`, no `node_modules` anywhere in output; repo `dist/ort` is also flat (26 files). Offscreen sets `wasmPaths = chrome.runtime.getURL('ort/')` (`main.ts:26`); manifest `web_accessible_resources` has `ort/*.wasm`, `ort/*.mjs`. Real-browser cache holds Vital/Dead labels, which only occur if the session initialised and inferred. |
| 8 | A whole-batch failure (empty/undefined results) does not re-burst and re-arm the alarm every tick | PRESENT_BEHAVIOR_UNVERIFIED | Present and wired (`classifier.ts:292-301`): empty -> `kept.map(... label: null)` cached with `inferredAt: now`, so next tick is not stale. No test asserts it (grep: no `results: []`/undefined-results case in any test; the 254 count is unchanged from before the commit) and no real-browser run hit it. See advisory for the sendMessage-rejection residual. |
| 9 | Restricted URLs no-op; IDB quota guard; mem-probe DEV-gated | VERIFIED | Unchanged since prior verification; covered by the passing suite |
| 10 | Total extension memory footprint < 45 MB (NFR-01 gate of record) | HUMAN NEEDED | Teardown mechanism is now demonstrated in a real browser. The MB figure is not: harness measured shared-process /proc RSS/PSS, not Task Manager. |
| 11 | Cross-OS UI consistency (COMP-02) | HUMAN NEEDED (partial) | CSS normalization code-verified; Linux screenshots pass; Windows/macOS blocked on hardware |
| 12 | Permissions minimal: no `scripting`; six justified permissions | VERIFIED | `manifest.json` permissions: storage, tabs, alarms, contextMenus, activeTab, offscreen. Unchanged by 4238514. |
| 13 | Launch docs complete and aligned with shipped lifecycle | VERIFIED | `docs/MEMORY-RUNBOOK.md`, `PERMISSIONS.md`, `docs/STORE-LISTING.md` updated in 05-06; no TBD/FIXME/XXX in `classifier.ts` or `vite.config.ts` |

**Score:** 10/13 truths verified, 1 present but behavior-unverified (truth 8), 2 require physical measurement (truths 10, 11).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.ts` | Flat ORT copy (`stripBase`) | VERIFIED | Both targets carry `rename: { stripBase: true }`; fresh build output confirmed flat |
| `src/background/classifier.ts` | Freshness gate, alarm teardown, empty-batch caching | VERIFIED (truth 8 behavior unverified) | Substantive; wired from `hibernation.ts` and `index.ts` |
| `src/background/index.ts` | Alarm routing, no boot warm-up | VERIFIED | Unchanged |
| `src/shared/constants.ts`, `types.ts` | TTL, alarm name, `inferredAt`/`featureKey` | VERIFIED | Unchanged |
| `src/background/offscreen-idle.test.ts` | End-to-end G-05-1 regressions | VERIFIED but incomplete | Uses a healthy-offscreen mock only; cannot detect the failure that actually occurred |
| `dist/ort/*` | Runtime assets | VERIFIED | Flat, 26 files |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `hibernation.ts handleAlarmTick` | `classifyBatch` | direct call | WIRED |
| `classifyBatch` burst | `armIdleTeardown` alarm | `finally` + `ensureOffscreen` | WIRED |
| `chrome.alarms.onAlarm` | `teardownIfIdle` | `index.ts` OFFSCREEN_IDLE_ALARM branch | WIRED |
| `teardownIfIdle` | `RELEASE_SESSION` / `closeDocument` | `classifier.ts` / `offscreen/main.ts` | WIRED |
| `viteStaticCopy` | `dist/ort/` -> `wasmPaths` getURL('ort/') | build output | WIRED (previously NOT_WIRED in effect) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ai_classifications` cache | `label`/`confidence` | offscreen ONNX session via CLASSIFY_BATCH | Yes in real browser post-fix (Vital/Dead in cache) | FLOWING |
| Same, pre-fix | | session init failure -> `{results: []}` | No (`n:0`) | was DISCONNECTED; fixed |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npm test` (vitest run, once) | 14 files, 254 tests passed, 12.2 s | PASS |
| Build output flat | `./node_modules/.bin/vite build --outDir <scratch>`; `find ort -type d` | 0 subdirs, 26 files, 4 wasm, no node_modules | PASS |
| Repo `dist/ort` flat | `find dist/ort -type f`; `find dist -maxdepth 2 -name node_modules` | 26 flat files, none nested | PASS |
| Sole `ensureOffscreen` caller | grep non-test `src/` | only `classifier.ts` (def `:201`, call `:284`) | PASS |
| Empty-batch path covered by a test | grep `src/**/*.test.ts` for empty/undefined results | none found | FAIL (untested; see truth 8) |
| `scripting` absent from manifest | read `manifest.json` | absent | PASS |

### Probe Execution

No probe scripts apply to this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NFR-01 | 05-01, 05-05, 05-06 (ROADMAP Phase 5 requirement) | Extension RAM <= 45 MB total | NEEDS HUMAN | Idle teardown demonstrated in a real browser; no valid Task Manager measurement. REQUIREMENTS.md line 77 says "Complete", which is premature until the Task Manager reading is recorded. |
| NFR-04 | 05-05 | Zero telemetry | SATISFIED | Carried from prior verification; unchanged |
| NFR-05, NFR-06 | 05-02, 05-03 | Permission minimalism, MV3 compliance | SATISFIED | Manifest re-read this pass |
| COMP-02 | 05-04, 05-05 | Cross-OS | NEEDS HUMAN (partial) | Linux pass only |

Every ID declared in plan frontmatter (NFR-01, NFR-04, NFR-05, NFR-06, COMP-02) is accounted for. No orphaned IDs: ROADMAP maps only NFR-01 to Phase 5, and it is claimed by 05-01, 05-05, 05-06. NFR-04/05/06 and COMP-02 are mapped to Phases 1 and 3 in REQUIREMENTS.md and are carried here as supporting.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/background/classifier.ts` | 292-301 | New branch with no test | Warning | Truth 8 behavior-unverified |
| `src/background/classifier.ts` | 283-292 | `sendMessage` rejection not caught inside the burst; falls to outer catch with nothing cached | Warning | Residual per-tick re-burst in a rejection failure mode (advisory) |

No TBD/FIXME/XXX in files modified by 4238514.

### Human Verification Required

#### 1. NFR-01 Task Manager measurement

**Test:** Run `docs/MEMORY-RUNBOOK.md` on real Chrome stable with ~50 tabs, history seeded, idle 12+ min.
**Expected:** Offscreen absent at 12 and 13 min; total extension memory < 45 MB in Chrome Task Manager; clean recreate after a tab switch.
**Why human:** The only measurements are /proc RSS/PSS of a shared renderer process under Playwright Chromium; not comparable to the gate. Peak footprint while the document is alive (PSS 49.6 warm, 77.6 after recreate in the harness) is also unresolved against the "even with multiple models loaded" wording of success criterion 1.

#### 2. 49-tab 12-minute presence anomaly

**Test:** Re-run the 49-tab harness with per-minute alarm and `inferredAt` telemetry.
**Expected:** Late burst explains the +1 min delay; teardown ~10 min after the last burst.
**Why human:** Unconfirmed hypothesis; untracked `nfr01-diag-fixed.log` also shows a re-burst at t+10 min, so teardown can be deferred under tab churn (by design: any tab activation re-infers all candidates).

#### 3. Empty-batch behavior

**Test:** See `behavior_unverified_items` in frontmatter (unit test or forced session-init failure).
**Expected:** No per-tick re-burst; null-label rows cached.
**Why human:** Untested branch.

#### 4. Cross-OS screenshots on Windows and macOS

**Test:** Per `docs/CROSS-OS-SCREENSHOTS.md`.
**Expected:** Thin scrollbars, font fallback, no native-control divergence.
**Why human:** Needs Windows/macOS hardware.

### Gaps Summary

No code gaps. The deviation from the previous report is that G-05-1 had a second, upstream root cause (ORT asset path) that the simulated tests could not see, and that is now fixed and confirmed in a fresh build and in real-browser logs. Remaining items are physical-device or Task Manager measurements plus one untested defensive branch, so status is `human_needed`, not `passed`.

Non-blocking recommendations for the orchestrator or developer (verifier does not edit code):
1. Add a `classifier.test.ts` case for resolved-empty/undefined `CLASSIFY_BATCH` results (closes truth 8 cheaply) and consider catching a `sendMessage` rejection inside the burst so it also caches null rows.
2. Add a post-build assertion that `dist/ort/ort-wasm-simd-threaded.wasm` exists at top level (guards the exact regression that went unseen from Phase 3 until now).
3. Revert NFR-01 in `.planning/REQUIREMENTS.md` (line 77) from "Complete" to pending until the Task Manager reading is recorded.
4. Treat Phase 3 AI classification as having been non-functional in real builds before 4238514; the real-browser Vital/Dead labels in the cache are the first end-to-end evidence that inference works.
5. Commit or remove untracked `uat-evidence/nfr01-diag-fixed.log` and `nfr01-rerun.mjs`; the former contains a data point (re-burst at t+10 min) that is relevant to human item 2.

---

_Verified: 2026-10-12T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
