---
phase: 05-polishing-launch
verified: 2026-10-03T07:30:00Z
status: human_needed
score: 10/11 must-haves verified
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
covered_digest: "v1:sha256:5ff0ae5907616388b5fb2eac035c9d08b470018a5fce835e497391c6aa2632fd"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/11
  gaps_closed:
    - "G-05-1: offscreen document never torn down after idle window (code-level; per-tick re-arm of teardown removed, SW-suspension-proof alarm teardown added, boot warm-up removed)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "If CLASSIFY_BATCH resolves with empty/undefined results (offscreen error path, e.g. model load failure), classifyBatch returns before writing any cache entry, so candidates stay stale and every 1-min tick re-bursts and re-arms the idle alarm. G-05-1 behaviour would recur only in that failure mode."
    category: other
    reason: "Failure-mode edge, not the healthy idle path; per-tab inference errors still return a result row (label null) and are cached, so only a whole-batch failure triggers it. Worth a human glance during the real-browser run (check console for offscreen session init errors)."
    evidence_status: "none provided"
human_verification:
  - test: "NFR-01 memory gate of record, re-run after the G-05-1 fix (UAT test 1)"
    expected: "Following docs/MEMORY-RUNBOOK.md (cold-start precondition: >= 50 tab-history rows seeded): load dist/ unpacked in Chrome 120+, open ~50 tabs, record warm RSS, idle >= 12 min. Offscreen Document absent at 12 and 13 idle minutes (chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN') shows a pending alarm in the SW console after the first burst), total extension RSS < 45 MB in Chrome Task Manager, and the document is recreated without errors after a tab switch. Alternatively re-run .planning/phases/05-polishing-launch/uat-evidence/nfr01-run.mjs and confirm the offscreen target is absent."
    why_human: "Chrome Task Manager / real-browser measurement cannot run in CI. The prior real-browser run (Playwright Chromium 147) FAILED because the offscreen document persisted 13 min; the fix is code- and simulation-verified (254 tests) but G-05-1 is closed only when a real browser confirms teardown (real chrome.alarms scheduling and offscreen lifetime are not exercised by the vitest fakes)."
  - test: "Cross-OS UI screenshot pass on Windows and macOS (COMP-02 / UAT test 2)"
    expected: "Per docs/CROSS-OS-SCREENSHOTS.md: popup (hibernated + empty) and dashboard (Stats + Settings) show thin scrollbars (no Windows fat native bars), Geist to system-ui font fallback, no native-control divergence. Linux already passed (screenshots in uat-evidence/)."
    why_human: "Requires physical Windows/macOS devices; UAT marked this blocked on hardware."
---

# Phase 05: Polishing & Launch Verification Report

**Phase Goal:** Maximize stability, minimize resource footprint, and prepare for public release.
**Success Criteria (ROADMAP):**
1. Total extension memory footprint stays below 45MB even with multiple models loaded.
2. UI is fully responsive and consistent across Windows, macOS, and Linux.
3. All extension permissions are verified as the absolute minimum required for functionality.

**Verified:** 2026-10-03T07:30:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure plan 05-06 (G-05-1). Prior report (2026-06-23) was human_needed; the real-browser UAT then FAILED NFR-01 (offscreen present after 13 idle min), prompting 05-06.

## Goal Achievement

### G-05-1 Gap Closure (focus of this re-verification)

Root cause recorded in 05-HUMAN-UAT.md: `handleAlarmTick` runs every minute, classified every non-active http tab each tick, and `classifyBatch`'s `finally` re-armed the 10-min SW `setTimeout`, so it could never elapse; the timer was also lost on SW suspension. Code evidence that each cause is now removed:

| Cause | Fix in code | Evidence | Status |
|-------|-------------|----------|--------|
| Per-tick classification re-arms teardown | Freshness gate: `classifyBatch` reads cache, builds features, and only enters the burst path (`pending++`, `ensureOffscreen`, `sendMessage`, `armIdleTeardown`) when `isClassificationStale` flags a candidate; fresh batches only refresh `cachedAt` | `classifier.ts:264-315`; cold start returns at `:273` before any offscreen work; `AI_CLASSIFICATION_TTL_MS` (60 min) > `OFFSCREEN_IDLE_MS` (10 min) in `constants.ts:47,54` | VERIFIED |
| Teardown timer lost on SW suspension | One-shot `chrome.alarms.create(OFFSCREEN_IDLE_ALARM, { when })`, armed on doc creation (`:228`) and after each burst (`:291`); routed in `index.ts:68-71` to `teardownIfIdle()` | Alarm routing is top-level synchronous; `teardownIfIdle` guards on `pending > 0` then RELEASE_SESSION + `closeDocument()` | VERIFIED |
| Boot-time warm-up recreates doc after teardown | `ensureOffscreen()` call removed from `index.ts`; only `classifyBatch` calls it (grep of `src/` non-test shows sole caller `classifier.ts:284`) | `index.ts:19-21` comment; test "importing index.ts never creates the offscreen document" | VERIFIED |
| Mid-burst teardown race | `pending` spans `ensureOffscreen()` + sendMessage; `finally` decrements then re-arms | `classifier.ts:281-292` | VERIFIED |
| Hibernation side effects of stale-cache window | `hibernation.ts` untouched; `cachedAt` still refreshed each tick so Phase 3 wake-misclassification window keeps working; test asserts `cachedAt` follows ticks while `inferredAt` holds | `offscreen-idle.test.ts` wake-window test | VERIFIED |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Offscreen document is torn down after a sustained idle window with no classifications in flight, including the 49-tab/past-cold-start scenario that failed UAT | VERIFIED (simulated) | `offscreen-idle.test.ts`: 48 background tabs, 60 history rows, tick at t0 then 13 idle minutes: exactly 1 CLASSIFY_BATCH, 1 createDocument, 1 closeDocument at >= T0 + OFFSCREEN_IDLE_MS, doc stays down. Full suite run by me: 14 files / 254 tests pass. Real-browser confirmation pending (human item 1). |
| 2 | Idle teardown never fires while a CLASSIFY_BATCH is in flight | VERIFIED | `pending` guard `classifier.ts:191`; `classifier.test.ts` "pending spans ensureOffscreen" unit tests pass |
| 3 | The next burst after teardown transparently recreates the document | VERIFIED | Test "activity resumes": tab activation re-infers all 48 tabs, `createDocument` count 2, re-teardown after 11 more idle minutes; CR-01 `finally` clear retained (`:229-234`) |
| 4 | Teardown survives service-worker restart | VERIFIED (simulated) | Test "SW restart": module registry reset, timers cleared, alarm/doc state kept; closeDocument still called within one minute of T0+10 min. Real SW suspension behavior in Chrome not exercised (human item 1). |
| 5 | SW boot never creates the offscreen document | VERIFIED | Test + grep: no `ensureOffscreen`/`createDocument` outside `classifier.ts` |
| 6 | RELEASE_SESSION releases ORT session and nulls both singletons | VERIFIED | `offscreen/main.ts:135-148` (unchanged from prior verification, quick regression check OK) |
| 7 | Restricted URLs no-op; IDB quota guard; mem-probe DEV-gated | VERIFIED | Unchanged since prior verification; covered by passing suite (regression check) |
| 8 | Total extension memory footprint < 45 MB (NFR-01 gate of record) | HUMAN NEEDED | Mechanism now plausible end-to-end, but the only real-browser run so far FAILED; no post-fix real-browser measurement exists |
| 9 | Cross-OS UI consistency (COMP-02) | HUMAN NEEDED (partial) | CSS normalization in both `index.css` files verified earlier; Linux screenshots in `uat-evidence/` pass; Windows/macOS blocked on hardware |
| 10 | Permissions minimal: no `scripting`, six justified permissions | VERIFIED | `manifest.json` permissions = storage, tabs, alarms, contextMenus, activeTab, offscreen; `PERMISSIONS.md` and `STORE-LISTING.md` updated for second `alarms` use (git diff 93d090d..HEAD) |
| 11 | Launch docs complete and aligned with shipped lifecycle | VERIFIED | `docs/MEMORY-RUNBOOK.md` now states alarm-based teardown, cold-start seeding precondition, `chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN')` tip and new triage rows; no TBD/FIXME/XXX in modified files |

**Score:** 10/11 truths verified (truth 8 requires physical measurement; truth 9 code-verified with the per-OS portion folded into human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/background/classifier.ts` | Freshness gate, alarm-scheduled teardown, pending guard | VERIFIED | Substantive (330 lines), wired from `hibernation.ts:101` and `index.ts:10,70` |
| `src/background/index.ts` | Alarm routing, no boot warm-up | VERIFIED | `OFFSCREEN_IDLE_ALARM` branch at `:68`; no `ensureOffscreen` |
| `src/shared/constants.ts` | `AI_CLASSIFICATION_TTL_MS`, `OFFSCREEN_IDLE_ALARM` | VERIFIED | Lines 54, 58 |
| `src/shared/types.ts` | Optional `inferredAt`, `featureKey` | VERIFIED | Lines 23, 25; optional so legacy cache entries read as stale (safe) |
| `src/background/offscreen-idle.test.ts` | End-to-end G-05-1 regressions | VERIFIED | 5 scenarios drive real `handleAlarmTick`, `classifyBatch`, `index.ts` routing |
| `docs/MEMORY-RUNBOOK.md`, `PERMISSIONS.md`, `docs/STORE-LISTING.md` | Aligned with lifecycle | VERIFIED | Changed in `bbd77e3` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `hibernation.ts handleAlarmTick` | `classifier.ts classifyBatch` | `hibernation.ts:101` | WIRED |
| `classifyBatch` burst | `armIdleTeardown` alarm | `classifier.ts:228,291` | WIRED |
| `chrome.alarms.onAlarm` | `teardownIfIdle` | `index.ts:68-71` | WIRED |
| `teardownIfIdle` | `RELEASE_SESSION` handler / `closeDocument` | `classifier.ts:192-193` / `offscreen/main.ts:135` | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `npx vitest run` (run once) | 14 files, 254 tests passed (jsdom `scrollTo` noise is pre-existing, non-failing) | PASS |
| Sole `ensureOffscreen` caller is classifyBatch | grep of non-test `src/` | only `classifier.ts` | PASS |
| `scripting` absent from manifest | read `manifest.json` | absent | PASS |

### Probe Execution

No probe scripts apply to this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NFR-01 | 05-01, 05-05, 05-06 (ROADMAP Phase 5 requirement) | Extension RAM <= 45 MB total | NEEDS HUMAN | Code and simulation satisfy the idle-teardown lever; real-browser Task Manager reading outstanding. REQUIREMENTS.md line 77 already marks it "Complete", which is premature until human item 1 passes. |
| NFR-04, NFR-05, NFR-06, COMP-02 | 05-02..05-05 | Carried from prior verification | SATISFIED / COMP-02 partially human | Unchanged; see human item 2 for COMP-02 per-OS pass |

No orphaned requirement IDs: ROADMAP maps only NFR-01 to Phase 5, and it is claimed by plans 05-01, 05-05 and 05-06.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX in files modified by 05-06. One advisory (see frontmatter) on the whole-batch failure path.

### Human Verification Required

#### 1. NFR-01 memory gate, post-fix re-run

**Test:** Follow `docs/MEMORY-RUNBOOK.md` (seed >= 50 tab-history rows, ~50 tabs, warm reading, idle >= 12 min), or re-run `uat-evidence/nfr01-run.mjs`.
**Expected:** Offscreen Document absent at 12 and 13 idle minutes; total extension RSS < 45 MB in Chrome Task Manager; document recreates cleanly after a tab switch; `chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN')` returned a pending alarm after the first burst.
**Why human:** Real Chrome process memory and real `chrome.alarms`/offscreen lifetime are not exercised by the vitest fakes; the previous real-browser run failed.

#### 2. Cross-OS screenshots on Windows and macOS

**Test:** Per `docs/CROSS-OS-SCREENSHOTS.md`.
**Expected:** Thin scrollbars, font fallback, no native-control divergence; Linux already passed.
**Why human:** Needs Windows/macOS hardware.

### Gaps Summary

No code gaps. G-05-1's identified causes (per-tick re-arm, SW-timer loss, boot warm-up) are each eliminated in the code and covered by passing end-to-end simulated regressions. Remaining items are the manual NFR-01 Chrome measurement and the Windows/macOS screenshot pass, so status is human_needed. Recommend updating NFR-01 in REQUIREMENTS.md from "Complete" to pending until human item 1 passes.

---

_Verified: 2026-10-03T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
