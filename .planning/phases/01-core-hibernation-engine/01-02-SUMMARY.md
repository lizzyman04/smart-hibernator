---
phase: 1
plan: 2
subsystem: background-service-worker
tags: [hibernation, alarm-loop, tab-discard, badge, storage, mv3]
dependency_graph:
  requires:
    - npm-dependencies-installed
    - vite-build-pipeline
    - src-directory-structure
    - vitest-unit-test-infrastructure
  provides:
    - handleAlarmTick-implemented
    - handleManualHibernate-badge-wired
    - hibernation-engine-complete
  affects:
    - src/background/hibernation.ts
    - badge count correctness (FR-01, FR-02, FR-03)
tech_stack:
  added: []
  patterns:
    - Single atomic chrome.storage.local.get for all alarm-tick state (Pitfall 2 mitigation)
    - Per-discard undefined-return check guards incorrect hibernated_count increments
    - try/catch per discard prevents one closed tab from aborting entire tick
    - Badge update deferred until after all discards complete (batch update)
key_files:
  created: []
  modified:
    - src/background/hibernation.ts
decisions:
  - "handleAlarmTick reads all 5 storage keys in one get() call — reduces storage round-trips and minimises race window (Pitfall 2)"
  - "newDiscards counter accumulates successes; hibernated_count and badge only written when newDiscards > 0 — avoids unnecessary storage writes on quiet ticks"
  - "handleManualHibernate reads fresh hibernated_count from storage rather than relying on in-memory value — correct across SW restarts"
metrics:
  duration_seconds: 76
  completed_date: "2026-04-30T19:09:58Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 1
---

# Phase 1 Plan 2: Background Service Worker — Alarm Loop, Tab Discarding, Badge Summary

**One-liner:** Full `handleAlarmTick()` hibernation loop with single-call storage read, per-tab `isDiscardable()` evaluation, `chrome.tabs.discard()` with undefined-return guard, batch badge update, and `handleManualHibernate()` wired to count and badge.

---

## What Was Built

`src/background/hibernation.ts` replaced its stub body with the complete hibernation engine:

- **`handleAlarmTick()`**: reads `hibernation_enabled`, `tab_meta`, `protected_tabs`, `protected_domains`, `hibernated_count` in a single `chrome.storage.local.get([...])` call for atomicity. Returns immediately when `hibernation_enabled` is false. Queries all tabs with `chrome.tabs.query({})`, applies `isDiscardable()` to every tab, and awaits `chrome.tabs.discard(tab.id)` per eligible tab. Only counts discards where the return value is non-`undefined` (Chrome no-ops on active/protected/chrome:// tabs by returning `undefined`). After the loop, writes the incremented `hibernated_count` back to storage and calls `updateBadge(hibernatedCount)`. No-op on quiet ticks (zero new discards).
- **`handleManualHibernate()`**: upgraded from a bare `chrome.tabs.discard()` call to a full implementation that reads the current `hibernated_count`, increments it, writes it back, and calls `updateBadge(count)` on successful discard.
- **`isDiscardable()`**: unchanged — all 12 existing unit tests still green.

---

## Deviations from Plan

None — plan executed exactly as written. The implementation in the plan body was applied verbatim; no structural changes were required.

---

## Known Stubs

None in this plan's scope. The `handleAlarmTick()` stub documented in Plan 01-01 is now fully resolved.

Remaining stubs from Plan 01-01 scope (not this plan's responsibility):
- `App.tsx` shows "Smart Hibernator loading..." — resolved in Plan 01-04
- `index.test.ts` placeholder assertion — resolved in Plan 01-04
- `tests/e2e/.gitkeep` — resolved in Plan 01-04

---

## Threat Surface Scan

No new threat surface introduced. All three threats in the plan's `<threat_model>` are mitigated:

| Threat | Mitigation Applied |
|--------|--------------------|
| Global in-memory state lost on SW restart | All state read fresh from `chrome.storage.local` on every alarm tick — no module-level variables hold tab state |
| Concurrent alarm ticks race on storage | Single-call `get([...])` reduces race window; try/catch around each discard prevents stuck handler |
| Discarding a tab that becomes active between query and discard | `isDiscardable()` guards `tab.active`; `chrome.tabs.discard()` undefined-return check handles the residual race gracefully |

---

## Verification Results

1. `npx vitest run src/background/hibernation.test.ts` — 12/12 tests pass (all `isDiscardable` tests unchanged)
2. `npx vitest run` — 13/13 tests pass (full suite including placeholder index test)
3. `grep -c "chrome.tabs.query" src/background/hibernation.ts` — returns 1
4. `grep "updateBadge" src/background/hibernation.ts` — shows import + call in `handleAlarmTick` + call in `handleManualHibernate`
5. `grep "if (!hibernationEnabled) return" src/background/hibernation.ts` — returns 1 match
6. `./node_modules/.bin/vite build` — exits 0, 25 modules transformed, `dist/manifest.json` present

## Self-Check: PASSED
