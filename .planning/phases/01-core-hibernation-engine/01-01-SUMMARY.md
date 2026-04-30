---
phase: 1
plan: 1
subsystem: scaffold
tags: [vite, crxjs, react, typescript, tailwind, shadcn, vitest, playwright, mv3]
dependency_graph:
  requires: []
  provides:
    - npm-dependencies-installed
    - vite-build-pipeline
    - manifest-mv3
    - src-directory-structure
    - shadcn-ui-initialized
    - vitest-unit-test-infrastructure
    - playwright-e2e-infrastructure
  affects:
    - all subsequent plans (everything builds on this scaffold)
tech_stack:
  added:
    - react@19.2.5
    - react-dom@19.2.5
    - vite@8.0.10
    - "@crxjs/vite-plugin@2.4.0"
    - typescript@6.0.3
    - tailwindcss@4.2.4
    - "@tailwindcss/vite@4.2.4"
    - "@types/chrome@0.1.40"
    - vitest@4.1.5
    - jsdom@26.1.0
    - "@playwright/test@1.59.1"
    - shadcn@4.6.0 (via npx; adds Radix UI, clsx, tailwind-merge, lucide-react)
  patterns:
    - MV3 service worker with all top-level listeners (RESEARCH.md Pitfall 1 mitigated)
    - Single global HIBERNATE_CHECK alarm at 1-min period
    - Typed chrome.storage.local schema (StorageSchema, TabMeta)
    - isDiscardable() guard function with 6 protection conditions
    - vitest-chrome ESM bundle workaround for vitest@4.x CJS incompatibility
key_files:
  created:
    - package.json
    - package-lock.json
    - .gitignore
    - manifest.json
    - vite.config.ts
    - tsconfig.json
    - components.json
    - vitest.config.ts
    - vitest.setup.ts
    - playwright.config.ts
    - src/shared/types.ts
    - src/shared/constants.ts
    - src/background/index.ts
    - src/background/hibernation.ts
    - src/background/alarms.ts
    - src/background/badge.ts
    - src/background/storage.ts
    - src/background/contextMenus.ts
    - src/content/form-watcher.ts
    - src/popup/index.html
    - src/popup/index.css
    - src/popup/main.tsx
    - src/popup/App.tsx
    - src/components/ui/switch.tsx
    - src/components/ui/button.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/separator.tsx
    - src/lib/utils.ts
    - icons/icon16.png
    - icons/icon32.png
    - icons/icon48.png
    - icons/icon128.png
    - src/background/hibernation.test.ts
    - src/background/index.test.ts
    - tests/e2e/.gitkeep
  modified: []
decisions:
  - "Pinned vite@8.0.10 with CRXJS 2.4.0 — confirmed compatible at build (A3 risk resolved)"
  - "@types/react-dom@19.2.5 does not exist on npm; used 19.2.3 (latest available)"
  - "vitest-chrome@0.1.0 CJS entry incompatible with vitest@4.x; import ESM bundle directly"
  - "jsdom added as explicit devDependency (vitest jsdom environment requires it separately)"
  - "shadcn init defaults to base-nova style; overrode components.json to Default/gray to match UI-SPEC"
  - "Added @/ path alias in tsconfig.json and vite.config.ts resolve.alias for shadcn component imports"
metrics:
  duration_seconds: 738
  completed_date: "2026-04-30T19:02:46Z"
  tasks_completed: 4
  tasks_total: 4
  files_created: 34
  files_modified: 2
---

# Phase 1 Plan 1: Project Scaffold Summary

**One-liner:** Vite 8 + CRXJS 2.4 + React 19 + TypeScript 6 + Tailwind 4 + shadcn/ui MV3 Chrome extension scaffold with vitest 4 (13 unit tests green) and vite build passing.

---

## What Was Built

A complete, buildable MV3 Chrome extension skeleton:

- **npm dependencies** at exact pinned versions (with two documented deviations)
- **manifest.json** with MV3 permissions `[storage, tabs, alarms, contextMenus, scripting]`, background SW, popup, content script, and keyboard command
- **vite.config.ts** with CRXJS, React, Tailwind v4, `base: './'`, `assetsInlineLimit: 0`
- **tsconfig.json** with strict mode, bundler resolution, and path aliases
- **src/ tree**: background SW with all top-level listeners, hibernation guard, alarms, badge, storage, context menus; content form watcher; popup shell
- **icons**: amber `#F59E0B` placeholder PNGs at 16/32/48/128px
- **shadcn/ui**: initialized with Default style, gray base, CSS variables; switch, button, badge, separator components in `src/components/ui/`
- **vitest 4 + jsdom + 13 passing unit tests** for `isDiscardable()` guard logic
- **playwright.config.ts** for future E2E tests
- `npx vite build` exits 0; `dist/manifest.json` present

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@types/react-dom@19.2.5` does not exist on npm**
- **Found during:** Task 01-1
- **Issue:** Plan specified `@types/react-dom@19.2.5` but npm registry only has up to `19.2.3`
- **Fix:** Used `@types/react-dom@19.2.3` (closest available; types are compatible with react-dom@19.2.5)
- **Files modified:** `package.json`
- **Commit:** 5cfd693

**2. [Rule 3 - Blocking] `vitest-chrome@0.1.0` CJS entry incompatible with `vitest@4.x`**
- **Found during:** Task 01-4
- **Issue:** `vitest-chrome@0.1.0` uses `require('vitest')` in its CJS bundle, but vitest 4.x dropped the CJS entry point. `import * as chrome from 'vitest-chrome'` resolved to the CJS bundle and threw at test time. Only version `0.1.0` exists on npm.
- **Fix:** Changed import to `vitest-chrome/lib/index.esm.js` (the ESM bundle) which correctly imports from vitest ESM
- **Files modified:** `vitest.setup.ts`
- **Commit:** 4ad0868

**3. [Rule 3 - Blocking] `jsdom` not installed but required by vitest jsdom environment**
- **Found during:** Task 01-4
- **Issue:** vitest's `environment: 'jsdom'` requires `jsdom` as a peer dependency; not included in plan's install list
- **Fix:** `npm install -D jsdom@26.1.0`
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** 4ad0868

**4. [Rule 2 - Missing functionality] shadcn init chose wrong style and component path**
- **Found during:** Task 01-4
- **Issue:** `npx shadcn@latest init --defaults` selected "base-nova" style and placed components under `src/shared/components/ui/` (using `@shared/components` alias), inconsistent with UI-SPEC requirement for Default style in `src/components/ui/`
- **Fix:** Deleted incorrect output; manually created `components.json` with Default style, gray base, correct `@/components` aliases; ran `shadcn add` again to get components in correct location; added `@/` path alias to `tsconfig.json` and `vite.config.ts`
- **Files modified:** `components.json`, `tsconfig.json`, `vite.config.ts`
- **Commit:** 4ad0868

**5. [Rule 2 - Missing functionality] `src/lib/utils.ts` not generated by shadcn**
- **Found during:** Task 01-4
- **Issue:** shadcn components import `cn()` from `@/lib/utils` but shadcn did not generate the file (it expected a pre-existing utils during `add` flow)
- **Fix:** Created `src/lib/utils.ts` with standard `cn()` implementation using clsx + tailwind-merge
- **Files modified:** `src/lib/utils.ts` (created)
- **Commit:** 4ad0868

---

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `handleAlarmTick()` empty body | `src/background/hibernation.ts` | Wave 1 Plan 02 implements the full alarm handler |
| `App.tsx` shows "Smart Hibernator loading..." | `src/popup/App.tsx` | Wave 2 Plan 04 replaces with full popup UI |
| `index.test.ts` placeholder assertion | `src/background/index.test.ts` | Wave 3 Plan 05 implements full SW handler tests |
| `tests/e2e/.gitkeep` | `tests/e2e/` | Wave 3 Plan 05 adds E2E spec file |

These stubs are intentional per plan scope. The scaffold goal (buildable, loadable, tests green) is fully achieved.

---

## Threat Surface Scan

No new threat surface introduced beyond what is declared in the plan's `<threat_model>`. All manifest permissions are exactly `[storage, tabs, alarms, contextMenus, scripting]` with no `host_permissions`. Tailwind popup uses only static class names (no arbitrary values — MV3 CSP compliant).

---

## Verification Results

1. `node -e "...react==='19.2.5'..."` — PASSED
2. `node -e "...m.permissions..."` — `['storage','tabs','alarms','contextMenus','scripting']` — PASSED
3. `npx vite build` — exits 0; `dist/manifest.json` present — PASSED
4. `npx vitest run` — 13/13 tests pass (12 isDiscardable + 1 placeholder) — PASSED
5. All stub files exist in `src/background/`, `src/content/`, `src/popup/`, `src/shared/` — PASSED
6. `ls src/components/ui/` — `switch.tsx button.tsx badge.tsx separator.tsx` — PASSED

## Self-Check: PASSED
