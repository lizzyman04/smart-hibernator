---
phase: 05-polishing-launch
verified: 2026-06-23T01:15:00Z
status: human_needed
score: 9/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "NFR-01 Chrome Task Manager reading: total extension RSS < 45MB after idle teardown"
    expected: "After ~12 minutes idle with ~50 tabs open, Chrome Task Manager shows Offscreen Document absent and total extension RSS (SW + pages) below 45 MB. Offscreen document reappears on next classification burst without errors."
    why_human: "Task Manager reading is inherently manual (Shift+Esc); CI is single-OS and cannot measure Chrome process RSS. The offscreen idle-teardown mechanism (armIdleTeardown + teardownIfIdle + closeDocument) is code-verified, but the actual RAM budget confirmation requires a physical Chrome instance."
  - test: "Cross-OS UI screenshot pass: popup and dashboard render visually consistent on Windows, macOS, and Linux"
    expected: "Thin scrollbars (8px, no Windows fat native bars), Geist or system-ui font fallback, no native Radix control divergence across all three OSes."
    why_human: "Per-OS visual rendering cannot be verified in single-OS CI. CSS rules are code-verified (scrollbar-width:thin, ::-webkit-scrollbar width:8px, --app-font stack), but actual per-OS rendering output requires physical or cloud machines on Windows, macOS, and Linux."
---

# Phase 05: Polishing & Launch Verification Report

**Phase Goal:** Maximize stability, minimize resource footprint, and prepare for public release.
**Success Criteria:**
1. Total extension memory footprint stays below 45 MB even with multiple models loaded.
2. Cross-OS UI consistency (per-OS rendering normalized).

**Verified:** 2026-06-23T01:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Offscreen document is torn down (`closeDocument`) after a sustained idle window with no classifications in flight | VERIFIED | `teardownIfIdle()` in `classifier.ts:136–140` calls `closeDocument()` when `pending === 0`; armed via `armIdleTeardown()` at `OFFSCREEN_IDLE_MS = 10 * 60 * 1000` |
| 2 | Idle teardown never fires while a CLASSIFY_BATCH is in flight (pending ref-count guards it) | VERIFIED | `pending++` at line 212, `pending--` in `finally` at line 220; `teardownIfIdle()` early-returns at line 137 when `pending > 0`; test-proven (226 tests pass) |
| 3 | The next classifyBatch after teardown transparently recreates the offscreen document | VERIFIED | `ensureOffscreen()` calls `getContexts()`; after `closeDocument()`, contexts returns `[]`, triggering `createDocument()`. CR-01 fix applied: `finally` block clears `creatingOffscreen` to prevent wedge on rejection |
| 4 | RELEASE_SESSION releases the ORT session and nulls both singletons | VERIFIED | `main.ts:135–148` RELEASE_SESSION branch: `try { if (session) await session.release() } finally { session = null; sessionInit = null }`; single `addListener` confirmed (count=1) |
| 5 | Memory probe never throws when crossOriginIsolated is false and is absent from production builds | VERIFIED | `mem-probe.ts:24` gates on `import.meta.env.DEV`; `lines 29–36` double-gate on `crossOriginIsolated === true` and `typeof fn === 'function'`; narrowed casts applied (IN-04 addressed) |
| 6 | Content script and discard path no-op cleanly on restricted URLs — no console errors | VERIFIED | `restricted-urls.ts` exports `isInjectable()`; `form-watcher.ts` inlines denylist at top of file (`_isPageInjectable` flag); all listeners/sendMessage guarded; import-free (0 `^import` lines); 22-case truth table passes |
| 7 | IndexedDB QuotaExceededError triggers oldest-first eviction + one retry and never produces an unhandled rejection | VERIFIED | `idb.ts:77–100` `putWithQuotaGuard(write, evict)`: catches `QuotaExceededError`, calls `pruneIfNeeded`, retries once, swallows final failure; wraps `putThumbnail` and `putTabState`; tests pass |
| 8 | Total extension memory footprint < 45 MB (NFR-01 gate of record) | HUMAN NEEDED | Code mechanism verified (idle teardown + closeDocument destroys WASM context). Actual Chrome Task Manager reading deferred per user instruction: gate D-02 is inherently manual. Supporting code is correct and unit-tested. |
| 9 | Cross-OS UI consistency: scrollbars and fonts normalized in popup and dashboard (COMP-02) | VERIFIED (code) | Both `src/popup/index.css` and `src/dashboard/index.css` contain `scrollbar-width: thin`, `::-webkit-scrollbar { width: 8px; height: 8px; }`, `*::-webkit-scrollbar-thumb`, and `--app-font` CSS custom property with full per-OS fallback chain (`"Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Per-OS screenshot pass is HUMAN NEEDED. |
| 10 | manifest.json no longer requests the scripting permission; six kept permissions each have justification | VERIFIED | `grep -c '"scripting"' manifest.json` = 0; permissions = `[storage, tabs, alarms, contextMenus, activeTab, offscreen]`; `PERMISSIONS.md` at repo root maps each to its call site including `captureVisibleTab` for `activeTab` |
| 11 | Launch documentation package is complete and substantive (PRIVACY.md, runbook, screenshot checklist, store listing) | VERIFIED | All four docs exist with real content: PRIVACY.md cites zero-telemetry with grep evidence; MEMORY-RUNBOOK.md states "< 45 MB" gate, 6-step procedure, and triage table; CROSS-OS-SCREENSHOTS.md lists Windows/macOS/Linux checklists; STORE-LISTING.md has full CWS description, feature bullets, and permission fields. README references PRIVACY.md, PERMISSIONS.md, and LICENSE. |

**Score:** 9/11 truths verified (2 require human measurement)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/background/classifier.ts` | Idle-teardown timer + pending ref-count guard; `armIdleTeardown`, `teardownIfIdle` | VERIFIED | Both functions present and exported; `OFFSCREEN_IDLE_MS` imported (not hardcoded); CR-01 `finally`-clear fix applied at line 172–177 |
| `src/offscreen/main.ts` | RELEASE_SESSION handler nulling session+sessionInit | VERIFIED | Handler at lines 135–148 inside single `addListener`; `session = null`, `sessionInit = null` in `finally` |
| `src/shared/constants.ts` | `OFFSCREEN_IDLE_MS = 10 * 60 * 1000` | VERIFIED | Line 47: `export const OFFSCREEN_IDLE_MS = 10 * 60 * 1000` with D-01 comment |
| `src/shared/mem-probe.ts` | DEV-gated `logMemoryProbe()`, guards `crossOriginIsolated` and `measureUserAgentSpecificMemory` | VERIFIED | Lines 24, 29–34, 36; narrowed casts (IN-04 addressed); never throws |
| `src/shared/restricted-urls.ts` | `isInjectable()` predicate + `RESTRICTED_PREFIXES` | VERIFIED | Exports both; 9 prefixes including CWS store hosts |
| `src/content/form-watcher.ts` | Top-of-file inlined restricted-URL guard; import-free | VERIFIED | `_isPageInjectable` flag at top; `chrome://` and `chrome-extension://` at lines 13–14; guards all listeners at lines 82, 190, 308; 0 `^import` lines |
| `src/background/idb.ts` | `putWithQuotaGuard` wrapping `putThumbnail` and `putTabState` | VERIFIED | `putWithQuotaGuard` exported; wraps both at lines 105–112 and 224–231; reuses `pruneIfNeeded` as evictor |
| `manifest.json` | No `scripting`; `homepage_url`; version `1.0.1`; 6 permissions | VERIFIED | Scripting absent; `homepage_url = "https://github.com/lizzyman04/smart-hibernator"`; version `1.0.1`; permissions = 6 kept entries |
| `PERMISSIONS.md` | Per-permission justification table; `captureVisibleTab`; scripting-removal note | VERIFIED | Six rows; `captureVisibleTab` present; scripting-removal noted |
| `scripts/package.mjs` | Build-then-zip; stale-zip deletion; scripting guard; manifest at zip root | VERIFIED | `rmSync(outputZip)` at line 72 (WR-02 fixed); scripting guard at line 46 exits nonzero; build runs first; `zip -r` from `dist/` directory |
| `package.json` | `"package"` npm script; version `1.0.1` | VERIFIED | Script present; version matches manifest `1.0.1` (WR-03 fixed) |
| `src/popup/index.css` | `scrollbar-width: thin`, `::-webkit-scrollbar`, `--app-font` in `@layer base` | VERIFIED | All three present; existing `@apply` rules preserved |
| `src/dashboard/index.css` | Identical normalization to popup | VERIFIED | Byte-identical `@layer base` additions |
| `PRIVACY.md` | Zero-telemetry statement + grep evidence | VERIFIED | "Zero telemetry" and "No tracking, analytics, or crash reporting of any kind"; grep evidence at line 47 |
| `docs/MEMORY-RUNBOOK.md` | Chrome Task Manager procedure; `< 45 MB` threshold | VERIFIED | 6-step procedure; "< 45 MB" threshold stated at line 5 and in pass/fail table at lines 82–83 |
| `docs/CROSS-OS-SCREENSHOTS.md` | Windows + macOS + Linux checklists; surfaces listed | VERIFIED | Three OS sections with per-surface checklists and OS-specific scrollbar/font verification items |
| `docs/STORE-LISTING.md` | CWS description + feature bullets | VERIFIED | Full ~650-word description, short description, 5 feature bullets, CWS permission fields |
| `src/background/manifest.test.ts` | Asserts scripting absent, six permissions, homepage_url, icons, version | VERIFIED | 17 assertions; all pass in test run |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `classifier.ts classifyBatch` | `main.ts RELEASE_SESSION handler` | `chrome.runtime.sendMessage({ type: 'RELEASE_SESSION' })` in `teardownIfIdle()` at line 138 | WIRED | Pattern `RELEASE_SESSION` present at classifier.ts:138 and main.ts:135 |
| `classifier.ts teardownIfIdle` | `chrome.offscreen.closeDocument` | Guarded by `pending === 0` at line 137 | WIRED | `closeDocument()` called at classifier.ts:139; pending guard proven by tests |
| `scripts/package.mjs` | `dist/` fresh build | Runs `npm run build` via `execSync` before zip step | WIRED | `execSync('npm run build', ...)` precedes zip in script flow |
| `PERMISSIONS.md` | `manifest.json permissions` | One row per kept permission; scripting-removal note | WIRED | Six rows matching the six permissions in manifest.json |
| `form-watcher.ts` | Early return before listeners | Inlined `_isPageInjectable` flag gates lines 82, 190, 308 | WIRED | `chrome://` and `chrome-extension://` in inlined denylist; no `^import` lines |
| `idb.ts putWithQuotaGuard` | `pruneIfNeeded` eviction | QuotaExceededError catch → `pruneIfNeeded()` → retry | WIRED | Both `putThumbnail` and `putTabState` wrapped; `pruneIfNeeded` passed as evict callback |

---

### Data-Flow Trace (Level 4)

Not applicable — Phase 5 artifacts are lifecycle controls, CSS normalization, config files, and documentation. No new dynamic data-rendering components were introduced. Existing rendering surfaces were unchanged (frozen functionality boundary per plan 04).

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 226 tests pass | `npx vitest run` | 13 files, 226 tests, 0 failures, 11.57s | PASS |
| OFFSCREEN_IDLE_MS is 10 min (not hardcoded) | `grep "OFFSCREEN_IDLE_MS" src/shared/constants.ts` | `export const OFFSCREEN_IDLE_MS = 10 * 60 * 1000` | PASS |
| No `scripting` in manifest | `grep -c '"scripting"' manifest.json` | `0` | PASS |
| package.json has `package` script | `grep '"package"' package.json` | `"package": "node scripts/package.mjs"` | PASS |
| Both CSS files have scrollbar-width:thin | `grep -q "scrollbar-width" src/popup/index.css && grep -q "scrollbar-width" src/dashboard/index.css` | Both match | PASS |
| form-watcher.ts is import-free | `grep -c "^import" src/content/form-watcher.ts` | `0` | PASS |
| CR-01 fix: creatingOffscreen cleared in finally | `grep "creatingOffscreen === creation" src/background/classifier.ts` | `if (creatingOffscreen === creation) creatingOffscreen = null` at line 176 | PASS |
| WR-02 fix: stale zip deleted before recreation | `grep "rmSync" scripts/package.mjs` | `if (existsSync(outputZip)) rmSync(outputZip)` at line 72 | PASS |
| WR-03 fix: package.json version matches manifest | `grep '"version"' package.json` | `"1.0.1"` (matches manifest) | PASS |

---

### Probe Execution

No probes defined for this phase (no `scripts/*/tests/probe-*.sh` convention applies). Step 7b behavioral spot-checks substituted.

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| NFR-01 | 05-01, 05-05 | Extension RAM ≤ 45 MB total | NEEDS HUMAN (code satisfied) | Idle-teardown mechanism code-verified; `closeDocument()` destroys WASM context; Chrome Task Manager reading pending human gate |
| NFR-04 | 05-05 | Zero telemetry — no data leaves device | SATISFIED | PRIVACY.md documents zero-telemetry; `fetch()` in `src/` only fetches local `data:` URL (thumbnail compression) and local ORT model URL; no external hosts |
| NFR-05 | 05-03 | Permission minimalism — MV3 required only | SATISFIED | `scripting` removed from manifest; 6 remaining permissions all have call-site justifications in PERMISSIONS.md; `manifest.test.ts` pins the set |
| NFR-06 | 05-02, 05-03 | 100% native MV3 compliance | SATISFIED | Manifest V3 scaffold unchanged; no `background.scripts`; single SW entry point; all listeners registered synchronously; content-script conventions preserved |
| COMP-02 | 05-04, 05-05 | Windows/macOS/Linux/ChromeOS compatibility | NEEDS HUMAN (code satisfied) | CSS normalization applied (scrollbars + font stack); per-OS screenshot pass pending human verification |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TBD/FIXME/XXX/TODO/PLACEHOLDER markers in any phase-5-modified files | — | — |

All warnings from 05-REVIEW.md were addressed:
- **CR-01 (BLOCKER)**: `ensureOffscreen()` permanently wedging on rejected `createDocument` — FIXED. `finally` block at `classifier.ts:172–177` clears `creatingOffscreen` on both success and failure.
- **WR-01**: Unvalidated CLASSIFY_BATCH response shape — FIXED. `const results = Array.isArray(response?.results) ? response.results : []` at `classifier.ts:228`.
- **WR-02**: Stale zip archive entries on re-run — FIXED. `rmSync(outputZip)` before `zip -r` at `scripts/package.mjs:72`.
- **WR-03**: `package.json` version drift from manifest — FIXED. Both are `1.0.1`.
- **WR-04**: `getCssSelectorPath` non-unique selectors — Phase 4 pre-existing issue. Out of scope for Phase 5 (functionality frozen). No new regression introduced.
- **WR-05**: `execSync` error details suppressed — FIXED. `console.error('[package] zip failed:', err?.message ?? err)` at `package.mjs:84–87`.
- **IN-01, IN-02, IN-03, IN-04**: All informational; IN-04 addressed (narrowed casts in `mem-probe.ts`).

---

### Human Verification Required

#### 1. NFR-01 Memory Gate — Chrome Task Manager Reading

**Test:** Follow `docs/MEMORY-RUNBOOK.md` procedure:
1. Run `npm run package` (or `npm run build`) and load the built `dist/` as an unpacked extension in Chrome 120+.
2. Open ~50 real tabs across multiple domains; let the extension classify (alarm fires every 1 minute).
3. Open Chrome Task Manager (`Shift+Esc`). Record RSS of Smart Hibernator Service Worker + Offscreen Document. This is the "warm" reading.
4. Stop all interaction; wait at least 12 minutes (≥ `OFFSCREEN_IDLE_MS` = 10 min plus margin).
5. Re-open Task Manager. Confirm the **Offscreen Document process is absent** and record total extension RSS. This is the "idle" reading.

**Expected:** Total extension RSS (SW + any open pages) **< 45 MB** after the idle window; Offscreen Document absent; on the next classification alarm the Offscreen Document reappears without console errors.

**Why human:** The NFR-01 gate of record is a Chrome Task Manager reading (Shift+Esc) — a physical UI measurement that cannot be automated in CI. The `logMemoryProbe` dev helper is supplementary and usually unavailable because the extension intentionally runs `numThreads=1` (non-cross-origin-isolated).

---

#### 2. Cross-OS UI Screenshot Pass

**Test:** Follow `docs/CROSS-OS-SCREENSHOTS.md` procedure on each of Windows, macOS, and Linux:
1. Load the built extension.
2. Capture screenshots of the popup (with tabs), popup (empty), dashboard Stats tab, and dashboard Settings tab on each OS.
3. Confirm per-OS: scrollbars are thin/consistent (no Windows fat native bars), fonts render via Geist Variable or system-ui fallback, no native-control divergence (all controls are Radix-based).
4. Compare side-by-side across all three OSes.

**Expected:** Visual consistency across Windows, macOS, and Linux for all four surfaces. Screenshots double as CWS store-listing assets.

**Why human:** Per-OS UI rendering (scrollbar chrome, font metric differences, native control fallback) cannot be verified in single-OS CI. The CSS rules that drive normalization are code-verified; the actual rendered output on each OS requires physical or cloud machines.

---

### Gaps Summary

No code gaps. Both human verification items are inherently manual measurements that cannot be automated — they are not code deficiencies.

The two must-haves that are HUMAN NEEDED (NFR-01 physical RAM reading and cross-OS screenshot pass) were explicitly designated as manual gates by the user ("skip gates") because:
- D-02 (NFR-01 gate of record): Chrome Task Manager is a physical process-memory measurement tool, not a CI primitive.
- D-13 (cross-OS screenshot pass): CI is single-OS Linux; Windows/macOS rendering requires separate machines.

All supporting code for both gates is implemented, unit-tested (226 tests pass), and the CR-01 blocker from the code review has been fixed.

---

_Verified: 2026-06-23T01:15:00Z_
_Verifier: Claude (gsd-verifier)_
