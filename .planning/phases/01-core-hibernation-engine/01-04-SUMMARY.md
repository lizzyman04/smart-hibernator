---
phase: 1
plan: 4
subsystem: testing
tags: [vitest, playwright, e2e, unit-tests, mv3, chrome-extension, fr-04, nfr-06, comp-01]
dependency_graph:
  requires:
    - handleAlarmTick-implemented
    - handleManualHibernate-badge-wired
    - hibernation-engine-complete
    - popup-ui-complete
    - vitest-unit-test-infrastructure
    - playwright-e2e-infrastructure
  provides:
    - unit-tests-green
    - e2e-smoke-tests-green
    - nfr-06-lint-gate-green
    - phase-1-test-suite-complete
  affects:
    - src/background/index.test.ts
    - tests/e2e/fixtures.ts
    - tests/e2e/extension.spec.ts
    - vitest.setup.ts
    - vitest.config.ts
    - manifest.json
tech_stack:
  added: []
  patterns:
    - vitest-chrome { chrome } named import (ESM bundle fix from Plan 01-01 extended)
    - chrome.action MV3 mock via vi.fn() in vitest.setup.ts (vitest-chrome is MV2 only)
    - Playwright launchPersistentContext with --load-extension for MV3 extension E2E
    - fileURLToPath(import.meta.url) instead of __dirname for ESM-compatible path resolution
    - page.waitForFunction poll before storage read (onInstalled async timing guard)
key_files:
  created:
    - tests/e2e/fixtures.ts
    - tests/e2e/extension.spec.ts
  modified:
    - src/background/index.test.ts
    - vitest.setup.ts
    - vitest.config.ts
    - manifest.json
decisions:
  - "chrome.action mock added to vitest.setup.ts globally — vitest-chrome covers only MV2 browserAction; all badge.ts callers need chrome.action.setBadgeText/setBadgeBackgroundColor as vi.fn() resolving to undefined"
  - "manifest.json exclude_matches removed — Chrome enforces chrome:// injection restriction at platform level regardless; web-ext (Firefox tool) rejects Chrome-only URL schemes as JSON_INVALID"
  - "vitest.config.ts exclude: ['tests/e2e/**'] — prevents Playwright spec files from being picked up by vitest runner (test.describe from @playwright/test is incompatible)"
  - "fileURLToPath(import.meta.url) in fixtures.ts — TypeScript compiled as ESM; __dirname not defined in ES module scope"
  - "waitForFunction poll in storage defaults E2E test — onInstalled fires async after SW starts; immediate storage.get returns undefined before initialization completes"
metrics:
  duration_seconds: 977
  completed_date: "2026-04-30T19:46:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 4
---

# Phase 1 Plan 4: Tests — SW Handler Unit Tests + Playwright E2E Smoke Test Summary

**One-liner:** 16 unit tests green (vitest) + 3 E2E smoke tests green (Playwright) completing the Phase 1 test suite — with MV3 chrome.action mock, ESM-compatible __dirname fix, and web-ext lint gate passing at exit 0.

---

## What Was Built

### Task 04-1: SW Handler Unit Tests (`src/background/index.test.ts`)

Replaced the placeholder stub with 4 meaningful tests for `handleManualHibernate()`:

- **Test 1:** `chrome.tabs.discard` called with correct tabId (FR-04 path verification)
- **Test 2:** `hibernated_count` incremented in storage on successful discard (non-undefined return)
- **Test 3:** storage NOT written when discard returns `undefined` (tab not discardable guard)
- **Test 4:** Documentation test confirming index.ts wiring is verified by grep

Two supporting fixes required to make the tests work:

1. **`vitest.setup.ts` chrome import fix:** The ESM bundle exports `{ chrome }` as a named export, not a namespace-level object. Changed `import * as chrome` → `import { chrome }` so `global.chrome.tabs` resolves correctly (previously `global.chrome` was the module namespace object with `tabs: undefined`).

2. **`vitest.setup.ts` chrome.action mock:** `vitest-chrome@0.1.0` only covers MV2 APIs (`chrome.browserAction`). `badge.ts` calls `chrome.action.setBadgeText/setBadgeBackgroundColor` (MV3). Added a `chromeMV3Action` object with `vi.fn().mockResolvedValue(undefined)` for all used `chrome.action` methods, merged into the global chrome object.

### Task 04-2: Playwright E2E Smoke Tests (`tests/e2e/`)

Created `tests/e2e/fixtures.ts` and `tests/e2e/extension.spec.ts`:

- **fixtures.ts:** `chromium.launchPersistentContext` with `--load-extension` and `--disable-extensions-except` pointing to `dist/`. Extension ID extracted from the service worker URL. Context cleaned up on teardown.

- **extension.spec.ts:** Three tests:
  1. SW registers successfully — `serviceWorkers[0].url()` matches `chrome-extension://` (COMP-01, NFR-06)
  2. Popup page opens without errors — `text=Smart Hibernator` visible (FR-04)
  3. Storage defaults initialized on install — polls `hibernation_enabled` until set, then asserts all 4 keys match expected defaults (FR-01, FR-02)

Four supporting fixes required:

1. **`manifest.json` `exclude_matches` removed:** Chrome blocks content script injection into `chrome://` and `chrome-extension://` at the platform level. The `exclude_matches` patterns are redundant and `web-ext lint` (Firefox-oriented tool) rejects `chrome://*/*` as `JSON_INVALID`. Removing them makes `web-ext lint` exit 0 with only non-blocking Firefox-compatibility warnings.

2. **`fixtures.ts` `__dirname` fix:** TypeScript compiled as ES module. `__dirname` is not defined in ESM scope. Replaced with `fileURLToPath(import.meta.url)` + `path.dirname()`.

3. **`vitest.config.ts` exclude:** Vitest was discovering `tests/e2e/extension.spec.ts` and failing because `test.describe` from `@playwright/test` is incompatible with vitest's runner. Added `exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']`.

4. **E2E storage timing fix:** The storage defaults test was flaky — `onInstalled` fires asynchronously after the SW starts. Immediate `storage.get` returned `undefined` on some runs. Added `page.waitForFunction` poll (up to 5s) to wait for `hibernation_enabled` to be set before asserting.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest.setup.ts chrome mock assignment was broken**
- **Found during:** Task 04-1, first test run
- **Issue:** `import * as chrome from 'vitest-chrome/lib/index.esm.js'` gives the module namespace `{ chrome: {...} }`. `Object.assign(global, { chrome })` set `global.chrome = namespaceObject`, so `global.chrome.tabs` was `undefined`.
- **Fix:** Changed to `import { chrome }` (named destructure) so `global.chrome` is the actual mock object
- **Files modified:** `vitest.setup.ts`
- **Commit:** `083bbd2`

**2. [Rule 2 - Missing functionality] chrome.action MV3 mock missing from vitest.setup.ts**
- **Found during:** Task 04-1, after fixing import
- **Issue:** `vitest-chrome@0.1.0` only provides MV2 `chrome.browserAction`. `badge.ts` (called by `handleManualHibernate`) uses `chrome.action.setBadgeText/setBadgeBackgroundColor`. All three tests threw `TypeError: Cannot read properties of undefined (reading 'setBadgeText')`.
- **Fix:** Added `chromeMV3Action` mock object with `vi.fn().mockResolvedValue(undefined)` for all used `chrome.action` methods; spread into global chrome assignment
- **Files modified:** `vitest.setup.ts`
- **Commit:** `083bbd2`

**3. [Rule 1 - Bug] manifest.json exclude_matches caused web-ext lint to exit 1**
- **Found during:** Task 04-2, NFR-06 gate verification
- **Issue:** `web-ext` is Firefox-oriented and reports `JSON_INVALID` for `chrome://*/*` and `chrome-extension://*/*` URL schemes (12 errors, exit code 1). These are Chrome-only URL schemes.
- **Fix:** Removed `exclude_matches` from `manifest.json` content_scripts — Chrome enforces the restriction at the platform level regardless. The patterns were defensive but redundant.
- **Files modified:** `manifest.json`
- **Commit:** `20790f7`

**4. [Rule 1 - Bug] fixtures.ts used __dirname in ESM module scope**
- **Found during:** Task 04-2, first `npx playwright test` run
- **Issue:** `ReferenceError: __dirname is not defined in ES module scope` at `fixtures.ts:5`
- **Fix:** Replaced `__dirname` with `fileURLToPath(import.meta.url)` + `path.dirname()`; added `import { fileURLToPath } from 'url'`
- **Files modified:** `tests/e2e/fixtures.ts`
- **Commit:** `20790f7`

**5. [Rule 2 - Missing functionality] vitest.config.ts missing e2e exclusion**
- **Found during:** Task 04-2, final full suite run
- **Issue:** Vitest picked up `tests/e2e/extension.spec.ts` and failed: `Playwright Test did not expect test.describe() to be called here`. Full unit suite returned exit 1.
- **Fix:** Added `exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']` to `vitest.config.ts`
- **Files modified:** `vitest.config.ts`
- **Commit:** `20790f7`

**6. [Rule 1 - Bug] E2E storage defaults test was flaky (timing)**
- **Found during:** Task 04-2, second full suite run
- **Issue:** `onInstalled` fires asynchronously; immediate `storage.get` after `domcontentloaded` returned `undefined` for `hibernation_enabled` on non-first runs
- **Fix:** Added `page.waitForFunction` poll (5s timeout) to wait for `hibernation_enabled !== undefined` before reading and asserting storage state
- **Files modified:** `tests/e2e/extension.spec.ts`
- **Commit:** `f9becc2`

---

## Known Stubs

None. All stubs from Plans 01-01 through 01-03 are now resolved:
- `index.test.ts` placeholder — replaced with full FR-04 test suite
- `tests/e2e/.gitkeep` — replaced with `fixtures.ts` + `extension.spec.ts`

Phase 1 has no remaining stubs.

---

## Threat Surface Scan

No new threat surface introduced. All three threats in the plan's `<threat_model>` are mitigated:

| Threat | Mitigation Applied |
|--------|--------------------|
| Tests pass with mocks but fail with real Chrome APIs | E2E tests run against a real Chromium instance via `launchPersistentContext` — validates actual extension loading |
| Test file imports trigger side effects in SW | Unit tests import `handleManualHibernate` directly from `./hibernation` — no SW entry-point import; no top-level listener registration in tests |
| E2E test leaves orphaned Chrome processes | `playwright.config.ts` sets `workers: 1`; fixture calls `context.close()` in teardown |

---

## Verification Results

1. `npx vitest run --reporter=verbose` — 16/16 tests pass, exit 0 — PASSED
2. `web-ext lint --source-dir=dist` — exit 0 (warnings only: React bundle innerHTML + Firefox-only notices) — PASSED
3. `DISPLAY=:0 npx playwright test` — 3/3 E2E tests pass, exit 0 (stable across 3 runs) — PASSED
4. `npx tsc --noEmit` — exit 0 (1 deprecation warning about `baseUrl` in TypeScript 6 — pre-existing, non-blocking) — PASSED
5. `grep "handleManualHibernate(tab.id)" src/background/index.ts` — 2 matches (contextMenus.onClicked + commands.onCommand) — PASSED
6. `grep "launchPersistentContext" tests/e2e/fixtures.ts` — 1 match — PASSED
7. `./node_modules/.bin/vite build` — exit 0, `dist/manifest.json` present — PASSED

## Self-Check: PASSED
