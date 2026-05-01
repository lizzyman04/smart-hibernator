---
phase: 01-core-hibernation-engine
fixed_at: 2026-05-01T07:44:50Z
review_path: .planning/phases/01-core-hibernation-engine/01-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-05-01T07:44:50Z
**Source review:** .planning/phases/01-core-hibernation-engine/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: Unhandled promise from `handleAlarmTick` in alarm listener

**Files modified:** `src/background/index.ts`
**Commit:** c5150a8
**Applied fix:** Added `.catch((err) => console.error(...))` to the `handleAlarmTick()` call inside the alarm listener so unhandled rejections no longer silently kill the service worker.

---

### WR-02: Race condition — stale `hibernated_count` in `handleAlarmTick`

**Files modified:** `src/background/hibernation.ts`
**Commit:** c9e5a6d
**Applied fix:** Removed the stale `hibernatedCount` read from the top-of-function batch get; after all discards complete, re-reads `hibernated_count` fresh from storage and adds only the delta, preventing popup concurrent writes from being overwritten. Also removed the now-unused `hibernated_count` key from the initial `storage.get` call.

---

### WR-03: `isDiscardable` treats tabs with no `TabMeta` as permanently active

**Files modified:** `src/background/hibernation.ts`
**Commit:** 72b4c2c
**Applied fix:** Changed `meta?.lastActiveAt ?? now` to `meta?.lastActiveAt ?? 0` so tabs with no recorded activity are treated as immediately eligible for hibernation rather than permanently immune.

---

### WR-04: `handleHibernateClick` increments stale React state for `hibernated_count`

**Files modified:** `src/popup/App.tsx`
**Commit:** a004b8b
**Applied fix:** Replaced `state.hibernatedCount + 1` with a fresh `chrome.storage.local.get('hibernated_count')` read immediately before the write, so concurrent storage-listener updates do not cause the count to be set one lower than the true value.

---

### WR-05: `onInstalled` resets user data on extension `update`

**Files modified:** `src/background/index.ts`
**Commit:** f2a7d52
**Applied fix:** Split the single `install || update` branch into two: on `install` all keys are written with defaults; on `update` only keys that are `undefined` in storage are backfilled. `createContextMenus()` and `ensureHibernateAlarm()` moved outside the conditional so they always run regardless of reason.

---

_Fixed: 2026-05-01T07:44:50Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
