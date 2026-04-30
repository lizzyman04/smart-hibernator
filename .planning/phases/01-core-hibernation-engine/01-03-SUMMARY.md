---
phase: 1
plan: 3
subsystem: popup-ui
tags: [react, popup, chrome-storage, tailwind, shadcn, mv3, ui]
dependency_graph:
  requires:
    - npm-dependencies-installed
    - shadcn-ui-initialized
    - vite-build-pipeline
    - src-directory-structure
  provides:
    - popup-ui-complete
    - global-toggle-wired
    - hibernate-button-wired
    - protect-toggle-wired
    - count-display-wired
  affects:
    - src/popup/App.tsx
tech_stack:
  added: []
  patterns:
    - chrome.storage.local.get multi-key single call on mount (Pitfall 2 mitigation)
    - chrome.storage.onChanged listener with cleanup return function (React useEffect pattern)
    - Popup calls chrome.tabs.discard() directly (documented intentional deviation from Responsibility Map)
    - Optimistic UI update on toggle + authoritative storage write
    - undefined-return guard on chrome.tabs.discard() (same pattern as background SW)
    - All Tailwind classes static — no arbitrary values (MV3 CSP compliant)
key_files:
  created: []
  modified:
    - src/popup/App.tsx
decisions:
  - "Popup calls chrome.tabs.discard() directly (not via sendMessage) — intentional deviation from Responsibility Map; reduces round-trip latency with no security cost in trusted MV3 context"
  - "Zero-state display uses prose 'No tabs hibernated' (Copywriting Contract) over numeric 0 (UI-SPEC §6) — prose is more user-friendly and consistent with extension tone"
  - "Storage changes to protected_tabs handled in separate setState call to access prev.currentTabId correctly — pattern avoids stale closure issue"
metrics:
  duration_seconds: 95
  completed_date: "2026-04-30T19:14:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 1
---

# Phase 1 Plan 3: Popup UI — React App with Global Toggle, Hibernate Button, Protect Toggle, Count Display Summary

**One-liner:** Full React popup UI replacing App.tsx stub — five UI-SPEC sections wired to chrome.storage.local with live onChanged subscription, MV3 CSP-compliant static Tailwind classes, and amber/zinc dark theme.

---

## What Was Built

`src/popup/App.tsx` replaced entirely with the complete Phase 1 popup:

- **Header:** Extension icon (20x20 from `icons/icon48.png`) + "Smart Hibernator" brand name (`text-base font-semibold text-zinc-50`).
- **Global Hibernation Toggle:** Reads/writes `hibernation_enabled` boolean to `chrome.storage.local`. shadcn Switch with `data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700`.
- **"Hibernate this tab" Button:** Full-width shadcn Button (`variant="outline"`) with Moon/Loader2 icon. Calls `chrome.tabs.discard(tabId)`, increments `hibernated_count`, calls `chrome.action.setBadgeText` and `setBadgeBackgroundColor`. Disabled + label changes when tab is already discarded or protected. Loading state with `animate-spin` during discard operation.
- **"Protect this tab" Toggle:** Reads/writes `protected_tabs` number array. Adds/removes current tab ID atomically via `chrome.storage.local.get` + `set` pattern.
- **Hibernated Count Display:** `bg-zinc-900` card; `text-3xl font-semibold text-amber-400` count when non-zero; "No tabs hibernated" prose in `text-zinc-400` at zero state.
- **Separators:** shadcn Separator (`bg-zinc-800 h-px w-full`) between all five sections.
- **Storage subscription:** `chrome.storage.onChanged.addListener` in `useEffect` with cleanup `removeListener` on unmount. Handles all three observed keys: `hibernation_enabled`, `hibernated_count`, `protected_tabs`.
- **Mount read:** Single `chrome.storage.local.get(['hibernation_enabled', 'hibernated_count', 'protected_tabs'], ...)` call — consistent with single-call atomicity pattern from Plan 01-02.

---

## Deviations from Plan

None — plan executed exactly as written. The implementation in the plan body was applied verbatim; no structural changes were required.

---

## Known Stubs

None in this plan's scope.

Remaining stubs from Plan 01-01 scope (not this plan's responsibility):
- `index.test.ts` placeholder assertion — resolved in Plan 01-04
- `tests/e2e/.gitkeep` — resolved in Plan 01-04

---

## Threat Surface Scan

No new threat surface introduced. All three threats in the plan's `<threat_model>` are mitigated:

| Threat | Mitigation Applied |
|--------|--------------------|
| Popup reads stale storage state | `chrome.storage.onChanged` listener updates React state on every change; storage is source of truth |
| XSS via tab title or URL rendered in popup | Phase 1 popup renders only counts and boolean toggle states — no user-controlled strings rendered as HTML |
| Tailwind arbitrary values violate MV3 CSP | All classes are static; `grep -E 'w-\[|h-\[|text-\[|bg-\['` returns no matches |

---

## Verification Results

1. `./node_modules/.bin/vite build` — exits 0; `dist/manifest.json` present — PASSED
2. `grep -E 'w-\[|h-\[|text-\[|bg-\[' src/popup/App.tsx` — no matches (MV3 CSP compliant) — PASSED
3. `grep "hibernation_enabled|hibernated_count|protected_tabs" src/popup/App.tsx` — all three keys present — PASSED
4. `grep "Auto-sleep inactive tabs" src/popup/App.tsx` — 1 match — PASSED
5. `grep "Exclude from auto-hibernation" src/popup/App.tsx` — 1 match — PASSED
6. `grep "No tabs hibernated" src/popup/App.tsx` — 1 match (zero-state) — PASSED
7. `grep "chrome.storage.onChanged.addListener" src/popup/App.tsx` — 1 match — PASSED
8. `grep "chrome.storage.onChanged.removeListener" src/popup/App.tsx` — 1 match (cleanup) — PASSED
9. `grep "chrome.tabs.discard" src/popup/App.tsx` — 1 match — PASSED
10. `grep "text-amber-400" src/popup/App.tsx` — 1 match (count display) — PASSED

## Self-Check: PASSED
