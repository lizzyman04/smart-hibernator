---
phase: 02-ui-and-rich-previews
plan: "03"
subsystem: popup
tags: [popup, fr-09, tdd, hibernated-tab-manager, wake-tab, dashboard-link, thumbnail]

# Dependency graph
requires:
  - phase: 02-02
    provides: "idb.ts with getThumbnail/deleteThumbnail, thumbnail.ts, index.ts onUpdated, hibernation.ts timeoutMs"

provides:
  - src/popup/App.tsx: "Redesigned popup: hibernated-tab manager with list, Wake Tab button, Dashboard footer link"
  - src/popup/App.test.tsx: "5 behavioral tests covering FR-09 contract (empty state, list render, wake, dashboard link)"

affects:
  - 02-04 (dashboard — popup footer link opens dashboard page built in Wave 4)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN: test file written first (RED against Phase 1 App), App.tsx redesigned to turn GREEN"
    - "chrome.tabs.query({discarded:true}) in useEffect async fn with Promise.all for thumbnail IDB lookup"
    - "Fallback card pattern: Globe icon + domain text on gradient when no dataUrl in IDB"
    - "getAllByText in tests when same text appears in multiple DOM elements (fallback card + row body)"

key-files:
  created: []
  modified:
    - src/popup/App.tsx (Phase 1 popup redesigned into hibernated-tab manager — all Phase 1 elements retained)
    - src/popup/App.test.tsx (Wave 0 stubs replaced with 5 behavioral tests — all passing)

key-decisions:
  - "getAllByText used in test 3 instead of getByText for domain text — domain appears in both fallback card span and row body span (two elements)"
  - "chrome.storage.onChanged.addListener/removeListener not mocked in tests — vitest-chrome uses real event-emitter functions, not vi.fn() spies; mockReturnValue throws TypeError"
  - "text-3xl removed from count stat span, replaced with text-xl per UI-SPEC §10"
  - "Header text-base upgraded to text-xl per UI-SPEC §2"

requirements-completed: [FR-09]

# Metrics
duration: 15min
completed: "2026-05-03"
---

# Phase 2 Plan 03: Wave 3 Popup Redesign Summary

**Popup redesigned as a hibernated-tab manager: scrollable list of discarded tabs with thumbnail/fallback cells, Wake Tab buttons, empty state, Dashboard footer link — all 5 behavioral tests passing; npm test: 6 files, 32 passing, 7 todo, 0 failures**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-03T22:11:00Z
- **Completed:** 2026-05-03T22:13:45Z
- **Tasks:** 2/2
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- Replaced Wave 0 `src/popup/App.test.tsx` stubs with 5 real behavioral tests (TDD RED phase). Tests mocked `../background/idb` (getThumbnail + deleteThumbnail), set up chrome.tabs.query mock, and covered: renders without crashing, empty state, Wake Tab list, wake handler calls chrome.tabs.update, Dashboard footer link calls chrome.tabs.create.
- Redesigned `src/popup/App.tsx` into a hibernated-tab manager (FR-09). Extended `PopupState` with `hibernatedTabs: HibernatedTabRow[]` and `wakingTabId: number | null`. Added `loadHibernatedTabs()` async function that queries `chrome.tabs.query({discarded: true})` and fetches thumbnails via `getThumbnail(tab.id)` per tab using `Promise.all`. Added `handleWakeTab(tabId)` using `chrome.tabs.update(tabId, {active:true})` + `deleteThumbnail(tabId)` eviction per D-16. Added `handleOpenDashboard()` using `chrome.runtime.getURL('src/dashboard/index.html')`.
- Retained all Phase 1 elements: global hibernation toggle, Hibernate this tab button, Protect this tab toggle, count stat. Updated count stat from `text-3xl` to `text-xl` per UI-SPEC §10. Updated header from `text-base` to `text-xl` per UI-SPEC §2.
- Added scrollable hibernated tab list with thumbnail cell (image if dataUrl, fallback card with Globe icon + domain if not), title, domain, and Wake Tab button per row. Empty state shows "No hibernated tabs" heading and "Tabs you hibernate will appear here." body.
- Added Dashboard footer link button (ghost variant, ExternalLink icon) that opens dashboard page.

## Task Commits

1. **Task 1: Flesh out popup App.test.tsx with behavioral tests (TDD RED)** — `b3d793f` (test)
2. **Task 2: Redesign src/popup/App.tsx into hibernated-tab manager (TDD GREEN)** — `4d679d3` (feat)

## Files Created/Modified

### Modified
- `src/popup/App.tsx` — Phase 1 popup redesigned into hibernated-tab manager (FR-09); imports getThumbnail/deleteThumbnail from `../background/idb`; all Phase 1 elements retained; typography updated per UI-SPEC
- `src/popup/App.test.tsx` — Wave 0 stubs replaced with 5 real behavioral tests; idb module mocked; domain text assertion uses `getAllByText` (appears in fallback card and row body)

## npm test Results

- **Before plan:** 6 files, 28 passing, 12 todo, 0 failures
- **After plan:** 6 files, 32 passing, 7 todo, 0 failures
- **Net new passing tests:** +4 (5 new popup behavioral tests replacing 5 todos; 1 Wave 0 render test already passing)
- **Todo remaining:** 7 (dashboard stubs — Plan 02-04)

## TDD Gate Compliance

- RED gate: `test(02-03)` commit `b3d793f` — 5 tests written, 4 failing against Phase 1 App.tsx
- GREEN gate: `feat(02-03)` commit `4d679d3` — App.tsx redesigned, all 5 tests pass, 32 total passing

## Decisions Made

- `getAllByText` used in test 3 for `example.com` domain — the domain string appears in two DOM nodes simultaneously (fallback card `<span>` inside the thumbnail cell AND the row body domain `<span>`). `getByText` throws "multiple elements found"; `getAllByText(...).length > 0` correctly asserts presence without being fragile.
- `chrome.storage.onChanged.addListener/removeListener` not mocked — vitest-chrome implements these as real event-emitter methods, not `vi.fn()` spies. Calling `.mockReturnValue` on them throws `TypeError: vi.mocked(...).mockReturnValue is not a function`. The Wave 0 stub comment already documented this; the new test file follows the same pattern.
- Import path for idb from popup: `../background/idb` (popup lives in `src/popup/`, idb in `src/background/`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `getByText` multiple-element error in test 3**
- **Found during:** TDD GREEN verification
- **Issue:** `screen.getByText('example.com')` threw "Found multiple elements" — domain text appears in both the fallback card's inner span and the row body domain span, since no thumbnail dataUrl is returned by the mocked `getThumbnail`.
- **Fix:** Changed `expect(screen.getByText('example.com')).toBeInTheDocument()` to `expect(screen.getAllByText('example.com').length).toBeGreaterThan(0)`
- **Files modified:** `src/popup/App.test.tsx`
- **Commit:** `4d679d3` (included in Task 2 commit)

**2. [Rule 3 - Blocking] Removed invalid `chrome.storage.onChanged` mock calls**
- **Found during:** TDD RED phase (all 5 tests failed with TypeError)
- **Issue:** `vi.mocked(chrome.storage.onChanged.addListener).mockReturnValue(undefined)` throws `TypeError: vi.mocked(...).mockReturnValue is not a function` — vitest-chrome uses real event-emitter functions for onChanged, not vi.fn() stubs.
- **Fix:** Removed both mock lines; added comment explaining the vitest-chrome behavior (already documented in Wave 0 stub and STATE.md)
- **Files modified:** `src/popup/App.test.tsx`
- **Commit:** `b3d793f`

## Known Stubs

- `src/dashboard/App.test.tsx` — 7 todo tests still pending (Plan 02-04)

These are intentional Wave 0 contracts, not regressions.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced beyond what the plan's threat model documents (T-02-03-01 through T-02-03-04). All threats accepted or mitigated per plan:
- thumbnail dataUrl rendered via `<img src={dataUrl}>` — React JSX escaping prevents script injection (T-02-03-01 mitigated)
- tab.title rendered as React text node — not innerHTML, no XSS possible (T-02-03-02 accepted)
- domain extracted with `new URL(tab.url).hostname` in try/catch — malformed URLs return empty string (T-02-03-03 mitigated)
- CSS overflow-y: auto with max-h-[220px] — even 100 tabs render without layout overflow (T-02-03-04 accepted)

## Self-Check: PASSED

- `src/popup/App.tsx` exists and is >220 lines — confirmed (283 lines)
- `src/popup/App.test.tsx` exists with 5 named tests — confirmed
- Task 1 commit `b3d793f` — verified in git log
- Task 2 commit `4d679d3` — verified in git log
- `npm test` exits 0: 6 files, 32 passing, 7 todo, 0 failures
- All plan verification checks pass:
  1. npm test exits 0 ✓
  2. `grep "discarded.*true" src/popup/App.tsx` ✓
  3. `grep "Wake Tab" src/popup/App.tsx` ✓
  4. `grep "deleteThumbnail" src/popup/App.tsx` ✓
  5. `grep "runtime.getURL.*dashboard" src/popup/App.tsx` ✓
  6. `grep "text-3xl" src/popup/App.tsx` — only in comment, not as a CSS class ✓
