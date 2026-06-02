---
phase: 03-ai-intelligence
fixed_at: 2026-05-14T00:00:00Z
review_path: .planning/phases/03-ai-intelligence/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-05-14T00:00:00Z
**Source review:** .planning/phases/03-ai-intelligence/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (3 Critical + 3 Warning; Info excluded per fix scope)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: ORT session permanently broken after first initialization failure

**Files modified:** `src/offscreen/main.ts`
**Commit:** `1f08b85`
**Applied fix:** Wrapped `await sessionInit` in `try/finally` so `sessionInit = null` always executes, even when the IIFE rejects. Previously the null-reset on line 43 was unreachable after a rejection, leaving a permanently rejected promise that caused every subsequent `getSession()` call to rethrow the same error.

---

### CR-02: Wake-misclassification signal is dead code

**Files modified:** `src/background/index.ts`
**Commit:** `44ffa33`
**Applied fix:** Moved the `changeInfo.discarded === false` wake-signal block to the top of the `onUpdated` listener, before the `status !== 'complete'` early-return guard. Chrome emits `discarded:false` on the `loading` event, not on `complete`, so the check was previously unreachable. `recordWakeMisclassification` is now live code that fires correctly when a discarded tab is woken.

---

### CR-03: IDB blocking() handler does not close the database connection

**Files modified:** `src/background/idb.ts`
**Commit:** `595064c`
**Applied fix:** Added `(event.target as IDBDatabase).close()` inside the `blocking()` callback, after nullifying `dbPromise`. Previously only the JS reference was cleared; the underlying `IDBDatabase` connection remained open, keeping the other context's upgrade blocked indefinitely.

---

### WR-01: Tab-history IDB store grows unboundedly

**Files modified:** `src/background/hibernation.ts`
**Commit:** `530fe22`
**Applied fix:** Added `pruneTabHistory(Date.now() - AI_HISTORY_WINDOW_MS)` call at the end of `handleAlarmTick`, wrapped in try/catch so IDB errors do not interrupt the hibernation cycle. Also added `AI_HISTORY_WINDOW_MS` to the constants import and `pruneTabHistory` to the idb import.

---

### WR-02: Empty-string domain passes KEEP_ALIVE validation

**Files modified:** `src/background/index.ts`
**Commit:** `009bd39`
**Applied fix:** Added `message.domain.length > 0` guard to the KEEP_ALIVE validation condition. The existing `length < 256` check passed for empty string (length 0 is less than 256). The new guard prevents `recordKeepAlive('', tabId)` from writing a domain-bias record with an unmatchable empty-string key.

---

### WR-03: (navigator as any).gpu — unsafe type erasure for WebGPU probe

**Files modified:** `src/offscreen/main.ts`
**Commit:** `1f08b85` (combined with CR-01 — both changes are in the same `getSession` function)
**Applied fix:** Replaced `!!(navigator as any).gpu` with `'gpu' in navigator`. The `in` operator was already present in the same expression (`typeof navigator !== 'undefined' && 'gpu' in navigator`), making the `!!(navigator as any).gpu` access redundant and unsafe. Removing it eliminates the `as any` cast entirely.

---

## Skipped Issues

None — all 6 in-scope findings were fixed successfully.

---

## Test Results

`npm test` (via `npx vitest run`): **113 passed, 0 failed** — no regressions introduced.

---

_Fixed: 2026-05-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
