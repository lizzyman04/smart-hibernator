---
phase: 02-ui-and-rich-previews
plan: "01"
subsystem: ui
tags: [idb, recharts, fake-indexeddb, testing-library, shadcn, vitest, typescript, manifest-v3]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: vitest setup, chrome mock infrastructure, shared types/constants, shadcn base components

provides:
  - idb@8.0.3 and recharts@3.8.1 installed as production dependencies
  - fake-indexeddb@6.2.5, @testing-library/react, @testing-library/jest-dom installed as dev dependencies
  - shadcn slider, tabs, input, scroll-area components scaffolded
  - HibernationEvent interface and timeout_minutes/hibernation_events StorageSchema keys
  - DEFAULT_TIMEOUT_MINUTES, RAM_PER_TAB_MB, THUMBNAIL_MAX_SIZE_BYTES, IDB_SIZE_CAP_BYTES constants
  - fake-indexeddb/auto wired into vitest.setup.ts for IDB testing
  - manifest.json: activeTab permission, web_accessible_resources, extension_pages CSP
  - vite.config.ts: dashboard entry in rollupOptions.input
  - Four Wave 0 test stub files proving test infrastructure (npm test exits 0, 20 passing + 20 todo)

affects:
  - 02-02 (Wave 1 — idb.ts, thumbnail.ts depend on these types/constants/manifest/config)
  - 02-03 (Wave 2 — popup redesign depends on shadcn tabs/slider/scroll-area and test infra)
  - 02-04 (Wave 3 — dashboard depends on recharts, vite.config dashboard entry, CSP)

# Tech tracking
tech-stack:
  added:
    - idb@8.0.3 (IndexedDB promise wrapper)
    - recharts@3.8.1 (charting library for dashboard)
    - fake-indexeddb@6.2.5 (in-memory IDB for jsdom tests)
    - "@testing-library/react@16.3.2" (component rendering in tests)
    - "@testing-library/jest-dom@6.9.1" (DOM matchers)
    - "@radix-ui/react-slider, @radix-ui/react-tabs, @radix-ui/react-scroll-area" (shadcn peer deps)
  patterns:
    - Wave 0 stub pattern: create failing/pending tests before implementation to define behavioral contracts
    - vitest.config.ts resolve.alias mirrors vite.config.ts for consistent module resolution
    - chrome.storage.onChanged.addListener is a real event-emitter in vitest-chrome (not vi.fn()) — do not call mockReturnValue on it

key-files:
  created:
    - src/background/idb.test.ts (FR-08 IDB CRUD contract stubs)
    - src/background/thumbnail.test.ts (FR-08 compression contract stubs)
    - src/popup/App.test.tsx (FR-09 popup manager stubs)
    - src/dashboard/App.test.tsx (FR-10 dashboard stubs)
    - src/components/ui/slider.tsx (shadcn slider)
    - src/components/ui/tabs.tsx (shadcn tabs)
    - src/components/ui/input.tsx (shadcn input)
    - src/components/ui/scroll-area.tsx (shadcn scroll-area)
  modified:
    - package.json (5 new dependencies added)
    - src/shared/types.ts (HibernationEvent interface + 2 StorageSchema keys)
    - src/shared/constants.ts (4 new Phase 2 constants)
    - vitest.setup.ts (fake-indexeddb/auto import appended)
    - vitest.config.ts (resolve.alias for @ -> src/ added)
    - manifest.json (activeTab, web_accessible_resources, content_security_policy)
    - vite.config.ts (rollupOptions.input.dashboard added)

key-decisions:
  - "shadcn CLI invoked via node node_modules/shadcn/dist/index.js (no shell bin registered) — npx shadcn add fails with missing script error"
  - "vitest.config.ts needs resolve.alias matching vite.config.ts — shadcn components import @/lib/utils which only resolves with alias"
  - "chrome.storage.onChanged.addListener is a real event-emitter in vitest-chrome (not vi.fn()) — plan stubs incorrectly assumed mockReturnValue would work; removed those calls"
  - "import 'fake-indexeddb/auto' placed after Object.assign in vitest.setup.ts — ES module imports are hoisted so position is logically equivalent to top-level"
  - "tsc --noEmit reveals pre-existing errors (chrome not found, tsconfig baseUrl deprecation) that pre-date Plan 02-01; not fixed as out of scope per deviation rules"

patterns-established:
  - "Wave 0 stub pattern: write pending tests (it.todo) before implementation so contracts are defined upfront"
  - "vitest.config.ts resolve.alias must mirror vite.config.ts alias for consistent module resolution in tests"
  - "Shadcn onChanged mock: never call vi.mocked(chrome.storage.onChanged.addListener).mockReturnValue — it is a real function"

requirements-completed: [FR-08, FR-09, FR-10]

# Metrics
duration: 15min
completed: "2026-05-03"
---

# Phase 2 Plan 01: Wave 0 Foundation Summary

**idb/recharts/testing-library deps installed, HibernationEvent types + Phase 2 constants added, manifest CSP + activeTab + dashboard entry wired, four Wave 0 test stubs passing (npm test: 6 files, 20 pass, 20 todo)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-03T19:47:00Z
- **Completed:** 2026-05-03T21:58:13Z
- **Tasks:** 3/3
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments

- Installed all Phase 2 runtime dependencies (idb, recharts) and test dependencies (fake-indexeddb, @testing-library/react, @testing-library/jest-dom)
- Scaffolded four shadcn/ui components (slider, tabs, input, scroll-area) required by Wave 2/3 UIs
- Extended shared type system with HibernationEvent interface, timeout_minutes and hibernation_events StorageSchema keys, and four Phase 2 constants
- Updated manifest.json with activeTab permission (for captureVisibleTab), web_accessible_resources (for dashboard page), and extension_pages CSP with style-src unsafe-inline (for Recharts Tooltip)
- Added rollupOptions.input.dashboard to vite.config.ts for CRXJS multi-entry build
- Wired fake-indexeddb/auto into vitest.setup.ts enabling IDB tests in jsdom
- Created four Wave 0 test stub files: all infra checks pass, behavioral contract todos defined for Wave 1-3 implementation

## Task Commits

1. **Task 1: Install deps and add shadcn components** - `32aabff` (feat)
2. **Task 2: Extend types, constants, vitest setup, manifest, and vite config** - `b2ceea4` (feat)
3. **Task 3: Create four Wave 0 test stub files** - `f98a43f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

### Created
- `src/background/idb.test.ts` - FR-08 IDB CRUD stubs with fake-indexeddb infra check
- `src/background/thumbnail.test.ts` - FR-08 compression stubs with OffscreenCanvas absence check
- `src/popup/App.test.tsx` - FR-09 popup stubs with renders-without-crashing check
- `src/dashboard/App.test.tsx` - FR-10 dashboard stubs with suite-loads check
- `src/components/ui/slider.tsx` - shadcn slider (radix-ui based)
- `src/components/ui/tabs.tsx` - shadcn tabs (radix-ui based)
- `src/components/ui/input.tsx` - shadcn input
- `src/components/ui/scroll-area.tsx` - shadcn scroll-area (radix-ui based)

### Modified
- `package.json` - 5 new deps (idb, recharts, fake-indexeddb, @testing-library/react, @testing-library/jest-dom) + radix-ui peer deps
- `src/shared/types.ts` - HibernationEvent interface exported; StorageSchema extended with timeout_minutes + hibernation_events
- `src/shared/constants.ts` - DEFAULT_TIMEOUT_MINUTES=45, RAM_PER_TAB_MB=150, THUMBNAIL_MAX_SIZE_BYTES=256000, IDB_SIZE_CAP_BYTES=26214400
- `vitest.setup.ts` - import 'fake-indexeddb/auto' appended after chrome global setup
- `vitest.config.ts` - resolve.alias added: @ -> src/ (deviation fix, see below)
- `manifest.json` - activeTab in permissions array; web_accessible_resources for dashboard; content_security_policy.extension_pages with style-src unsafe-inline
- `vite.config.ts` - build.rollupOptions.input.dashboard = resolve(__dirname, 'src/dashboard/index.html')

## Decisions Made

- shadcn CLI invoked via `node node_modules/shadcn/dist/index.js` because no shell binary is registered in node_modules/.bin
- `import 'fake-indexeddb/auto'` placed after Object.assign in vitest.setup.ts — ES module imports are hoisted so the final position is semantically equivalent to top-level
- Pre-existing TypeScript errors (chrome globals not found, tsconfig baseUrl deprecation) are out of scope — not fixed; logged below

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added resolve.alias to vitest.config.ts**
- **Found during:** Task 3 (test stub files)
- **Issue:** shadcn components use `@/lib/utils` path alias. The alias was defined in vite.config.ts but not in vitest.config.ts, causing "Failed to resolve import @/lib/utils" when the popup App test imported App.tsx which imports Switch from shadcn
- **Fix:** Added `resolve: { alias: { '@': resolve(__dirname, 'src') } }` to vitest.config.ts
- **Files modified:** vitest.config.ts
- **Verification:** npm test exits 0 after fix
- **Committed in:** f98a43f (Task 3 commit)

**2. [Rule 1 - Bug] Removed incorrect mockReturnValue calls for chrome.storage.onChanged**
- **Found during:** Task 3 (test stub files, first npm test run)
- **Issue:** Plan stubs called `vi.mocked(chrome.storage.onChanged.addListener).mockReturnValue(undefined)` but vitest-chrome implements `onChanged.addListener` as a real event-emitter function, not a vi.fn() spy — calling `.mockReturnValue` throws "not a function"
- **Fix:** Removed those two lines from both App.test.tsx files; added explanatory comment
- **Files modified:** src/popup/App.test.tsx, src/dashboard/App.test.tsx
- **Verification:** npm test exits 0 after fix
- **Committed in:** f98a43f (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes required for npm test to exit 0. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors revealed by `tsc --noEmit`: chrome globals not found in source files, tsconfig baseUrl deprecation warning (TypeScript 6.0). These pre-date Plan 02-01 and are unrelated to Wave 0 work. Not fixed — out of scope per deviation rules. Logged to deferred-items tracking.

## Known Stubs

All four test files are intentional Wave 0 stubs. The `it.todo` tests are placeholders for Wave 1-3 implementations:
- `src/background/idb.test.ts` — 5 todo tests become green once idb.ts is implemented (Plan 02-02)
- `src/background/thumbnail.test.ts` — 3 todo tests become green once thumbnail.ts is implemented (Plan 02-02)
- `src/popup/App.test.tsx` — 5 todo tests become green once popup is redesigned (Plan 02-03)
- `src/dashboard/App.test.tsx` — 7 todo tests become green once dashboard is built (Plan 02-04)

These stubs are intentional — they define behavioral contracts upfront.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Wave 1 (Plan 02-02) prerequisites satisfied: idb installed, types extended, fake-indexeddb wired, manifest has activeTab, vite has dashboard entry
- All Wave 2 (Plan 02-03) prerequisites satisfied: shadcn slider/tabs/input/scroll-area available, popup test infra working
- All Wave 3 (Plan 02-04) prerequisites satisfied: recharts installed, dashboard rollup entry present, extension_pages CSP has style-src unsafe-inline
- No blockers.

---
*Phase: 02-ui-and-rich-previews*
*Completed: 2026-05-03*

## Self-Check: PASSED

- All 5 created files exist on disk
- All 3 task commits verified in git log (32aabff, b2ceea4, f98a43f)
- npm test exits 0: 6 test files, 20 passing, 20 todo, 0 failures
- All plan verification checks (9/9) pass
