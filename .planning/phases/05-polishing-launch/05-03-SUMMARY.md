---
phase: 05-polishing-launch
plan: "03"
subsystem: config
tags: [manifest, permissions, cws, packaging, zip, chrome-extension, security]

requires:
  - phase: 04-perfect-state-restoration
    provides: completed extension feature set that this phase hardens for CWS submission

provides:
  - manifest.json with scripting removed, version 1.0.1, homepage_url added
  - PERMISSIONS.md with per-permission justification table (six permissions with call sites)
  - scripts/package.mjs build-then-zip packaging producing a CWS-ready zip
  - src/background/manifest.test.ts pinning permissions and metadata against regression
  - 'package' npm script invoking the build-then-zip flow

affects: [05-polishing-launch, cws-submission, phase-5-plans]

tech-stack:
  added: []
  patterns:
    - "Manifest permission minimalism: remove unused permissions (scripting grep-confirmed absent) + justify each kept permission in PERMISSIONS.md"
    - "Build-then-zip packaging: always rebuild dist/ before zipping to avoid shipping stale manifests (Pitfall 6 guard)"
    - "Static manifest assertion test: vitest reads manifest.json from disk and asserts structural invariants"

key-files:
  created:
    - PERMISSIONS.md
    - scripts/package.mjs
    - src/background/manifest.test.ts
  modified:
    - manifest.json
    - package.json

key-decisions:
  - "Removed scripting permission from manifest.json (D-03) — grep-confirmed zero chrome.scripting usages in src/; pure manifest deletion with zero runtime impact"
  - "Bumped version 1.0.0 → 1.0.1 marking first launch-hardening release"
  - "Added homepage_url to manifest.json for CWS metadata (D-09)"
  - "Used system zip CLI (not web-ext; STATE.md: web-ext rejects chrome:// patterns) for packaging"
  - "Packaging script runs npm run build FIRST to prevent Pitfall 6 (stale dist) and exits nonzero if dist/manifest.json still contains scripting"
  - "PERMISSIONS.md explicitly notes activeTab and contextMenus are KEPT (not removed) because they back shipped features — D-04 justify-not-amputate"
  - "manifest.test.ts uses fs.readFileSync to load manifest.json at test time; no runtime chrome API needed for this pure structural assertion"

requirements-completed: [NFR-05, NFR-06]

duration: 3min
completed: "2026-06-22"
---

# Phase 05 Plan 03: Permissions Trim + Manifest Polish + Packaging Summary

**Removed unused scripting permission, polished manifest metadata (version 1.0.1, homepage_url), added six-permission PERMISSIONS.md justification doc, and build-then-zip packaging script with stale-dist guard**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-22T16:48:11Z
- **Completed:** 2026-06-22T16:51:31Z
- **Tasks:** 3/3
- **Files modified:** 5 (2 modified, 3 created)

## Accomplishments

- Removed the unused `scripting` permission from manifest.json (D-03 — grep-confirmed zero `chrome.scripting` usages in `src/`); six remaining permissions are all actively used
- Added `homepage_url`, bumped version to 1.0.1, and wrote `src/background/manifest.test.ts` with 17 passing assertions pinning the permission set, metadata, and icon sizes against regression (D-09)
- Created `PERMISSIONS.md` with a per-permission justification table mapping each of the six kept permissions to its exact call site in the codebase (D-04/D-10)
- Created `scripts/package.mjs` (build-then-zip, manifest-at-root, scripting guard) + `"package"` npm script for reproducible CWS-ready artifact production (D-09)

## Task Commits

1. **Task 1: Remove scripting, polish manifest metadata, add manifest-assertion test** - `5e4e39c` (feat)
2. **Task 2: PERMISSIONS.md justification doc** - `a23fc66` (docs)
3. **Task 3: Build-then-zip packaging script** - `a19daa3` (feat)

## Files Created/Modified

- `manifest.json` - Removed `scripting` permission; version bumped to 1.0.1; added `homepage_url`
- `src/background/manifest.test.ts` - 17 vitest assertions: scripting absent, six kept permissions present, homepage_url present, four icon sizes, version 1.0.1
- `PERMISSIONS.md` - Six-row permission justification table with call sites; scripting-removal note; D-04 rationale for keeping activeTab/contextMenus
- `scripts/package.mjs` - Node ESM packaging script: runs `npm run build` first, asserts no scripting in dist/manifest.json, zips dist/ contents with manifest at root, names output `smart-hibernator-<version>.zip`
- `package.json` - Added `"package": "node scripts/package.mjs"` to scripts block

## Decisions Made

- Used system `zip` CLI (available on the execution environment) rather than adding a node zip dependency — matches RESEARCH recommendation and avoids devDependency bloat
- Packaging script exits nonzero if `dist/manifest.json` still contains `scripting` after build (belt-and-suspenders Pitfall 6 guard — ensures CWS upload always matches source)
- manifest.test.ts reads manifest.json via `fs.readFileSync` + `path.resolve(__dirname, '../../manifest.json')` — no runtime Chrome APIs needed; simple and reliable in vitest jsdom environment

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria verified:
- `grep -c '"scripting"' manifest.json` returns 0
- `manifest.json` contains `homepage_url` and version `1.0.1`
- `permissions` array contains exactly six: storage, tabs, alarms, contextMenus, activeTab, offscreen
- `npx vitest run src/background/manifest.test.ts` exits 0 (17/17 pass)
- `PERMISSIONS.md` present with six justified rows + captureVisibleTab + scripting-removal note
- `scripts/package.mjs` invokes build before zip; guards scripting; maps manifest.json at zip root; no web-ext
- `package.json` scripts contains `"package"` key

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The `npm run package` command will trigger a full production build then produce a `smart-hibernator-1.0.1.zip` file at the repo root ready for Chrome Web Store upload.

## Next Phase Readiness

- CWS submission prerequisites (D-03/D-04/D-09) are complete
- The `npm run package` smoke check (manual — requires clean build environment) produces the CWS-ready zip
- Other Phase 5 plans (permissions hardening, CSS normalization, store listing, etc.) can proceed independently

---
*Phase: 05-polishing-launch*
*Completed: 2026-06-22*
