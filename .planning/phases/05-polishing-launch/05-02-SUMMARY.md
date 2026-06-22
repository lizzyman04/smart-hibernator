---
phase: 05-polishing-launch
plan: "02"
subsystem: edge-case-hardening
tags: [d-06, d-07, d-08, security, idb, content-script, badge, tdd]
dependency_graph:
  requires: []
  provides: [restricted-urls-helper, idb-quota-guard, churn-startup-invariants]
  affects: [src/shared/restricted-urls.ts, src/content/form-watcher.ts, src/background/idb.ts, src/background/index.test.ts, src/background/badge.ts]
tech_stack:
  added: []
  patterns: [inlined-denylist-no-import, putWithQuotaGuard-evict-retry, callListeners-churn-test, pure-badge-function-test]
key_files:
  created:
    - src/shared/restricted-urls.ts
    - src/shared/restricted-urls.test.ts
  modified:
    - src/content/form-watcher.ts
    - src/content/form-watcher.test.ts
    - src/background/idb.ts
    - src/background/idb.test.ts
    - src/background/index.test.ts
decisions:
  - "Inlined restricted-URL denylist in form-watcher.ts (no import) — content script no-import convention"
  - "putWithQuotaGuard exported for direct test assertions"
  - "pruneIfNeeded reused as evictor for both putThumbnail and putTabState"
  - "Task 3 invariants already correct — added pinning tests, no code changes to index.ts or badge.ts"
metrics:
  duration: 720s
  completed: "2026-06-22"
  tasks: 3/3
  files_created: 2
  files_modified: 5
---

# Phase 5 Plan 02: Edge-Case Hardening (D-06/D-07/D-08) Summary

**One-liner:** Restricted-URL no-op guard in content script + IDB quota evict-and-retry + churn/startup/badge invariants pinned with 330 passing tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restricted-URL guard + shared helper (D-06) | bf03c14 | src/shared/restricted-urls.ts (new), src/content/form-watcher.ts |
| 2 | IDB quota-exceeded guard reusing pruneIfNeeded (D-07) | 3c8e75e | src/background/idb.ts, src/background/idb.test.ts |
| 3 | Churn/startup/cold-start/badge integrity tests (D-07/D-08) | 573858c | src/background/index.test.ts |

## What Was Built

### Task 1 — Restricted-URL guard (D-06, T-05-05)

Created `src/shared/restricted-urls.ts` with:
- `RESTRICTED_PREFIXES`: array of 9 blocked prefixes (chrome://, chrome-extension://, edge://, about:, devtools://, view-source:, chrome-untrusted://, CWS store hosts)
- `isInjectable(url)`: predicate returning false for falsy/non-http/restricted URLs

Added top-of-file `_isPageInjectable` flag in `form-watcher.ts` using an inlined copy of the denylist (no import — content script no-import convention). All listener registrations and `sendMessage` calls are now guarded by `if (_isPageInjectable)`, so restricted pages (chrome://, extension pages, CWS store) produce no console errors and no failed messaging.

Full truth table tested: 22 cases including all 9 restricted prefixes, CWS store hosts, and injectable http/https URLs.

### Task 2 — IDB Quota-Exceeded Guard (D-07, T-05-06)

Added `putWithQuotaGuard(write, evict)` helper in `idb.ts`:
- Wraps write paths: `try { await write() } catch (QuotaExceededError) { await evict(); try { await write() } catch {} } else throw`
- Exported for direct test assertions
- `putThumbnail` and `putTabState` wrapped; both use `pruneIfNeeded` (oldest-first by capturedAt) as evict callback
- No new eviction logic — RESEARCH Pattern 4 / "Don't Hand-Roll"
- Non-quota errors re-throw to preserve existing behavior

### Task 3 — Churn/Startup/Cold-Start Invariants (D-07/D-08, T-05-07)

All invariants were already correct in `index.ts` and `badge.ts`. Added pinning tests:
- **Churn**: rapid `onActivated`/`onRemoved` via `callListeners()` — `lastActiveTabId` resets on removal, no double-count on pre-discarded tab
- **Cold-start**: `FORM_ACTIVITY`, `onActivated`, `onInstalled` handlers tolerate completely empty storage (`|| {}` fallbacks verified)
- **Startup-restore**: no `onStartup` listener in index.ts that could re-count pre-discarded tabs
- **Badge**: pure function asserted: `0→''`, `5→'5'`, `999→'999'`, `1000→'999+'`, `1500→'999+'`

## Decisions Made

1. **Inlined denylist in form-watcher.ts** — the no-import convention (established Phase 4 Wave 2) requires constants to be duplicated, not imported. The denylist in `restricted-urls.ts` and in `form-watcher.ts` are identical and this is documented as intentional.

2. **`putWithQuotaGuard` exported** — exported (not internal) so `idb.test.ts` can directly assert its behavior. The plan acceptance criteria requires testing the guard directly.

3. **`pruneIfNeeded` as evictor for `putTabState`** — `tab-state` store has no dedicated eviction function; `pruneIfNeeded` (thumbnail eviction) frees IDB space broadly, satisfying the "evict then retry" contract without introducing new eviction logic.

4. **Task 3 is assert-only** — all D-07/D-08 invariants were already correct. No code changes to `index.ts` or `badge.ts`. This is intentional per the plan: "verify invariants in code first; if any invariant is actually violated, fix minimally; otherwise leave unchanged and ADD tests."

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan-Guided Deviations

**Task 3 RED/GREEN observation:** The plan notes this is "assert-and-extend, NOT a rewrite." Tests for Task 3 passed immediately (GREEN without RED) because the invariants already hold. This is correct per the plan instructions — we verified the invariants, confirmed they're correct, and added tests pinning them. No RED/GREEN split possible for tests asserting already-correct behavior.

## Verification Results

All tests pass: `npx vitest run src/shared/restricted-urls.test.ts src/content/form-watcher.test.ts src/background/idb.test.ts src/background/index.test.ts` → 330 passed, 0 failed.

Grep gates:
- `grep -c "isInjectable" src/shared/restricted-urls.ts` → ≥1 ✓
- `grep -c "^import" src/content/form-watcher.ts` → 0 (import-free) ✓
- `grep -c "chrome-extension://" src/content/form-watcher.ts` → ≥1 ✓
- `grep -c "QuotaExceeded" src/background/idb.ts` → ≥1 ✓
- `putThumbnail` and `putTabState` both wrapped with `putWithQuotaGuard` ✓

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. This plan is purely defensive:
- T-05-05 (Information Disclosure): Mitigated — form-watcher no-ops on restricted pages
- T-05-06 (DoS/Quota): Mitigated — quota-exceeded evicts+retries, no unhandled rejection
- T-05-07 (Tampering/Badge): Mitigated — badge purity and churn correctness pinned by tests

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/shared/restricted-urls.ts | FOUND |
| src/shared/restricted-urls.test.ts | FOUND |
| 05-02-SUMMARY.md | FOUND |
| Commit 32cf485 (RED test-restricted-urls) | FOUND |
| Commit bf03c14 (feat-restricted-URL guard) | FOUND |
| Commit 764212f (RED test-quota-guard) | FOUND |
| Commit 3c8e75e (feat-quota-guard) | FOUND |
| Commit 573858c (feat-churn-tests) | FOUND |
| 330 tests passing | VERIFIED |
