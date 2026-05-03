---
phase: 02-ui-and-rich-previews
plan: "04"
subsystem: dashboard
tags: [dashboard, fr-10, tdd, recharts, radix-tabs, domain-whitelist, thumbnail-refresh]

# Dependency graph
requires:
  - phase: 02-03
    provides: "popup redesign (FR-09), idb/thumbnail infrastructure"

provides:
  - src/dashboard/index.html: "Dashboard entry HTML — title 'Smart Hibernator — Dashboard'"
  - src/dashboard/index.css: "Identical copy of popup/index.css — same Tailwind/shadcn/Geist imports"
  - src/dashboard/main.tsx: "ReactDOM.createRoot entry point — identical to popup/main.tsx"
  - src/dashboard/App.tsx: "Two-tab dashboard: Stats (hero metric, BarChart, Refresh) + Settings (slider, domain whitelist)"
  - src/dashboard/App.test.tsx: "8 behavioral tests covering FR-10 Stats metric, tab switching, domain add/remove/validation"

affects:
  - Phase 3+ (dashboard chart data populated by hibernation_events from hibernation.ts)

# Tech tracking
tech-stack:
  added:
    - "Recharts 3.8.1 — BarChart/Bar/XAxis/CartesianGrid/Tooltip/ResponsiveContainer (last-7-days hibernation chart)"
    - "ResizeObserver polyfill (vitest.setup.ts) — required for Recharts ResponsiveContainer in JSDOM"
  patterns:
    - "TDD RED/GREEN: App.test.tsx written first (RED against missing App.tsx), App.tsx implemented to turn GREEN"
    - "Radix UI Tabs require fireEvent.mouseDown(tab, {button:0, ctrlKey:false}) in JSDOM — fireEvent.click alone does not trigger onMouseDown handler"
    - "handleAddDomain validation: trim → strip https?:// → trim → empty check → duplicate check"
    - "onValueCommit for Slider (storage write on release only, not on every drag)"
    - "chrome.storage.local.get on mount + onChanged subscription with useEffect cleanup (same pattern as popup)"

key-files:
  created:
    - src/dashboard/index.html
    - src/dashboard/index.css
    - src/dashboard/main.tsx
    - src/dashboard/App.tsx
  modified:
    - src/dashboard/App.test.tsx (Wave 0 stubs replaced with 8 behavioral tests)
    - src/background/index.ts (CAPTURE_TAB message handler added)
    - vitest.setup.ts (ResizeObserver polyfill added for Recharts)

key-decisions:
  - "fireEvent.mouseDown with {button:0, ctrlKey:false} required for Radix Tabs tab switching in JSDOM (fireEvent.click targets onClick, Radix listens to onMouseDown)"
  - "Empty string test uses 'https://' as input — strips to '' after regex, button is enabled (non-empty input), handleAddDomain catches empty after strip"
  - "ResizeObserver polyfill added to vitest.setup.ts — Recharts ResponsiveContainer uses ResizeObserver internally; JSDOM does not implement it"
  - "Recharts formatter typed as (value: number) — no any-cast needed; recharts@3.8.1 + react@19.2.5 compiled without type errors"

requirements-completed: [FR-10]

# Metrics
duration: ~9 min
completed: "2026-05-03"
---

# Phase 2 Plan 04: Wave 4 Dashboard Summary

**Full-page dashboard created (FR-10): Stats tab with hero metric (~N MB freed), Recharts BarChart (last 7 days), Refresh thumbnails button; Settings tab with timeout Slider (onValueCommit) and domain whitelist (add/remove/validation). 8 behavioral tests passing; npm test: 6 files, 39 passing, 0 todo, 0 failures.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-03T20:18:18Z
- **Completed:** 2026-05-03T20:27:14Z
- **Tasks:** 2/2
- **Files created:** 4 (index.html, index.css, main.tsx, App.tsx)
- **Files modified:** 3 (App.test.tsx, index.ts, vitest.setup.ts)

## Accomplishments

### Task 1: Dashboard scaffold files

Created three scaffold files that mirror the popup entry point:
- `src/dashboard/index.html` — verbatim copy of popup/index.html with title changed to "Smart Hibernator — Dashboard"
- `src/dashboard/index.css` — byte-for-byte copy of popup/index.css with all `@import` chains (Tailwind, tw-animate-css, shadcn/tailwind.css, @fontsource-variable/geist)
- `src/dashboard/main.tsx` — identical to popup/main.tsx (ReactDOM.createRoot entry point)

### Task 2: Dashboard App.tsx + tests (TDD)

**TDD RED:** Replaced Wave 0 stub `App.test.tsx` with 8 behavioral tests covering the FR-10 contract. Tests failed as expected (App.tsx did not exist).

**TDD GREEN:** Created `src/dashboard/App.tsx` (337 lines) implementing:
- **Stats tab:** Hero metric `~{N} MB freed this session` computed via `state.hibernatedCount * RAM_PER_TAB_MB`, sub-stats row, Recharts BarChart with `buildChartData()` (groups hibernation_events by day of week for last 7 days), Refresh thumbnails button
- **Settings tab:** `<Slider>` with `min=5`, `max=240`, `step=5`, `onValueChange` for live label update, `onValueCommit` for storage write on release only; domain whitelist with `<Input>` + Add Domain button + validation + removable `<Badge>` chips with `aria-label="Remove {domain}"`
- `chrome.storage.local.get` on mount + `onChanged` subscription with cleanup (identical to popup App.tsx pattern)
- `handleAddDomain`: strips `https?://`, rejects empty after strip, rejects duplicates
- `handleRefreshThumbnails`: queries discarded tabs, sends `CAPTURE_TAB` message per tab

**CAPTURE_TAB handler added** to `src/background/index.ts` — enables dashboard Refresh thumbnails button by having the SW call `captureAndStore(tabId, '', windowId)` on demand.

## Task Commits

1. **Task 1: scaffold files** — `a51d12f` (feat)
2. **Task 2 RED: behavioral tests** — `fc724f7` (test)
3. **Task 2 GREEN: App.tsx + index.ts + vitest.setup.ts** — `6b40997` (feat)

## Files Created/Modified

### Created
- `src/dashboard/index.html` — entry HTML, title "Smart Hibernator — Dashboard"
- `src/dashboard/index.css` — verbatim copy of popup/index.css (all @imports identical)
- `src/dashboard/main.tsx` — ReactDOM.createRoot entry, verbatim copy of popup/main.tsx
- `src/dashboard/App.tsx` — 337 lines, two-tab dashboard (Stats + Settings), FR-10

### Modified
- `src/dashboard/App.test.tsx` — Wave 0 stubs replaced with 8 behavioral tests
- `src/background/index.ts` — CAPTURE_TAB message handler added (D-14 Refresh thumbnails)
- `vitest.setup.ts` — ResizeObserver polyfill added (Recharts ResponsiveContainer requires it in JSDOM)

## npm test Results

- **Before plan:** 6 files, 32 passing, 7 todo, 0 failures
- **After plan:** 6 files, 39 passing, 0 todo, 0 failures
- **Net new passing tests:** +7 (8 new dashboard behavioral tests replacing 7 Wave 0 todos; 1 infrastructure check already passing)

## TDD Gate Compliance

- RED gate: `test(02-04)` commit `fc724f7` — 8 tests written, failing (App.tsx did not exist; suite-level import error)
- GREEN gate: `feat(02-04)` commit `6b40997` — App.tsx created, all 8 tests pass, 39 total passing

## Recharts Type Compatibility

`recharts@3.8.1` with `react@19.2.5` compiled without TypeScript errors. The `formatter` prop on `<Tooltip>` typed as `(value: number) => [string, string]` worked without requiring `any` cast — no deviation needed.

## CAPTURE_TAB Handler

Added to `src/background/index.ts` as a second `chrome.runtime.onMessage.addListener` block (after the existing FORM_ACTIVITY handler). Calls `captureAndStore(tabId, '', windowId)` with silent error handling (tab may have been restored by the time the SW handles the message). The `captureAndStore` import was already present from Plan 02-02.

## Manual Verification Checklist (E2E — not automated)

These items require loading the unpacked extension in Chrome:

- [ ] Dashboard opens at `chrome.runtime.getURL('src/dashboard/index.html')` via popup "Dashboard" footer link
- [ ] Stats tab: hero metric shows `~N MB freed this session` with amber color
- [ ] Stats tab: BarChart renders with correct day labels (Sun–Sat)
- [ ] Stats tab: Refresh thumbnails button triggers CAPTURE_TAB for discarded tabs
- [ ] Settings tab: Slider drag shows live label update; storage write fires only on release
- [ ] Settings tab: Domain chips render with X button; removing a chip updates storage
- [ ] Dashboard live-updates when background hibernates a tab (onChanged subscription)
- [ ] Popup "Wake Tab" button restores a hibernated tab and removes it from the list

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Radix UI Tabs not activating on fireEvent.click in JSDOM**
- **Found during:** TDD GREEN verification (5 Settings-tab tests failing)
- **Issue:** The plan's test code used `fireEvent.click(screen.getByText('Settings'))` but Radix UI Tabs v1.x activates tabs via `onMouseDown` with `button === 0` and `ctrlKey === false`. `fireEvent.click` dispatches a click event which Radix does not listen to for tab switching.
- **Fix:** Changed all Settings tab navigation to `fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })`
- **Files modified:** `src/dashboard/App.test.tsx`
- **Commit:** `6b40997`

**2. [Rule 1 - Bug] ResizeObserver not defined in JSDOM (Recharts)**
- **Found during:** TDD GREEN verification (all Settings-tab tests failing with ReferenceError)
- **Issue:** `ResizeObserver is not defined` — Recharts `ResponsiveContainer` uses `ResizeObserver` internally; JSDOM does not implement it. This threw at render time, collapsing the Settings tab content.
- **Fix:** Added `ResizeObserverStub` class to `vitest.setup.ts` via `Object.defineProperty(globalThis, 'ResizeObserver', ...)` — standard JSDOM polyfill for Recharts.
- **Files modified:** `vitest.setup.ts`
- **Commit:** `6b40997`

**3. [Rule 1 - Bug] Empty string test used whitespace input which kept button disabled**
- **Found during:** TDD GREEN verification (empty string test still failing after fixes 1 and 2)
- **Issue:** The original plan test used `fireEvent.change(input, { target: { value: '   ' } })` + `addBtn.removeAttribute('disabled')`. React's synthetic event system ignores clicks on `disabled` buttons even after removing the DOM attribute; the handler never fired.
- **Fix:** Changed input value to `'https://'` — this is non-empty so the button is enabled, but after `handleAddDomain` strips the protocol prefix the domain becomes `''`, triggering the "Please enter a domain." error correctly.
- **Files modified:** `src/dashboard/App.test.tsx`
- **Commit:** `6b40997`

## Known Stubs

None. All Wave 0 dashboard stubs replaced with real behavioral tests. All 7 todos resolved.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond the plan's threat model (T-02-04-01 through T-02-04-05):
- Domain whitelist validation (T-02-04-01 mitigated): `trim()` + `replace(/^https?:\/\//, '')` + empty check applied in `handleAddDomain`
- Duplicate domain detection (T-02-04-02 mitigated): `state.protectedDomains.includes(domain)` after normalization
- CAPTURE_TAB message handler (T-02-04-03 accepted): calls `captureAndStore` which is constrained to active tab; no sensitive data exfiltration possible
- Recharts Tooltip inline styles (T-02-04-04 accepted): hardcoded constants only, no user data in inline styles
- handleRefreshThumbnails (T-02-04-05 accepted): bounded by open tab count, manual user action only

## Self-Check: PASSED

- `src/dashboard/index.html` exists, contains "Smart Hibernator — Dashboard" — confirmed
- `src/dashboard/index.css` exists, contains `@import 'tailwindcss'` and `@import "@fontsource-variable/geist"` — confirmed
- `src/dashboard/main.tsx` exists, contains `createRoot` — confirmed
- `src/dashboard/App.tsx` exists, 337 lines (min 200) — confirmed
- `src/dashboard/App.test.tsx` exists with 8 named tests — confirmed
- `src/background/index.ts` contains `CAPTURE_TAB` handler — confirmed
- `vitest.setup.ts` contains `ResizeObserver` polyfill — confirmed
- Task 1 commit `a51d12f` — verified in git log
- Task 2 RED commit `fc724f7` — verified in git log
- Task 2 GREEN commit `6b40997` — verified in git log
- `npm test` exits 0: 6 files, 39 passing, 0 todo, 0 failures — confirmed
- All plan verification checks pass (7/7):
  1. npm test exits 0 with all 39 tests green
  2. `ls src/dashboard/index.html src/dashboard/index.css src/dashboard/main.tsx src/dashboard/App.tsx` — all 4 exist
  3. `grep "RAM_PER_TAB_MB" src/dashboard/App.tsx` — match found
  4. `grep "onValueCommit" src/dashboard/App.tsx` — match found
  5. `grep "Domain already protected" src/dashboard/App.tsx` — match found
  6. `grep "CAPTURE_TAB" src/background/index.ts` — match found
  7. `grep "@import 'tailwindcss'" src/dashboard/index.css` — match found
