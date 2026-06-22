---
phase: 05-polishing-launch
plan: "04"
subsystem: frontend-css
tags: [cross-os, css-normalization, scrollbars, fonts, tailwind, d-13]
dependency_graph:
  requires: []
  provides: [cross-os-scrollbar-normalization, cross-os-font-normalization]
  affects: [src/popup/index.css, src/dashboard/index.css]
tech_stack:
  added: []
  patterns: [tailwind-v4-layer-base, css-custom-property-font-stack, webkit-scrollbar-normalization]
key_files:
  created: []
  modified:
    - src/popup/index.css
    - src/dashboard/index.css
decisions:
  - key: font-stack-via-css-custom-property
    choice: "--app-font custom property in :root with full per-OS fallback chain"
    rationale: "Keeps the font stack in one place; html selector references var(--app-font) so both popup and dashboard inherit consistently"
  - key: scrollbar-thumb-color
    choice: "rgb(0 0 0 / 0.2) fallback (no matching theme token)"
    rationale: "No existing oklch-based scrollbar token; rgb() modern syntax consistent with Tailwind v4 theme values; dark mode will inherit correctly via opacity"
  - key: control-normalization-scope-empty
    choice: "No native control normalization added"
    rationale: "grep confirmed zero <select> or <input type=range> in src/popup and src/dashboard; all controls are Radix-based and render consistently"
metrics:
  duration: 420s
  completed_date: "2026-06-22"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 2
---

# Phase 5 Plan 04: Cross-OS CSS Normalization Summary

**One-liner:** Added `--app-font` CSS variable with explicit per-OS fallback chain (Geist Variable → system-ui → -apple-system → Segoe UI → Roboto) and WebKit/Firefox thin-scrollbar normalization (8px, 20% opacity thumb) to `@layer base` in both popup and dashboard stylesheets.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Cross-OS scrollbar + font normalization in popup + dashboard CSS | 9a3c0cf | src/popup/index.css, src/dashboard/index.css |

## What Was Built

### `src/popup/index.css` and `src/dashboard/index.css` (identical changes)

Both files received the following additions:

**In `:root`:**
- `--app-font: "Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`

**In `@layer base *`:**
- `scrollbar-width: thin;` — Firefox/Chrome normalized thin scrollbars (D-13: Windows fat native bar fix)

**In `@layer base html`:**
- `font-family: var(--app-font);` — explicit per-OS fallback chain after Geist
- `-webkit-font-smoothing: antialiased;` — normalizes font weight rendering across OSes

**New `@layer base` rules:**
- `*::-webkit-scrollbar { width: 8px; height: 8px; }` — WebKit/Chrome thin bar override
- `*::-webkit-scrollbar-thumb { background: rgb(0 0 0 / 0.2); border-radius: 4px; }` — subtle thumb

All pre-existing `@apply` rules preserved: `border-border outline-ring/50`, `bg-background text-foreground`, `font-sans`.

## Verification

All acceptance criteria passed:

- `scrollbar-width` present in both CSS files: PASS
- `::-webkit-scrollbar` rules present in both CSS files: PASS
- Font fallback chain with `system-ui`, `-apple-system`, `Segoe UI` present: PASS
- Pre-existing `@apply border-border` / `bg-background` rules still present: PASS
- `grep -rc 'type="range"|<select' src/popup src/dashboard` returns 0: PASS (zero native controls)
- `npm run build` succeeds (run from main repo root): PASS

## Native Controls Audit

**Confirmed zero native controls requiring normalization:**
- No `<input type="range">` found in src/popup or src/dashboard
- No `<select>` found in src/popup or src/dashboard
- All form controls are Radix-based (shadcn slider/switch/scroll-area) — render consistently across OSes
- Control normalization scope: empty (as pre-confirmed in plan context and RESEARCH A4)

## Deviations from Plan

None — plan executed exactly as written.

The one minor implementation detail: `--app-font` was added to the `:root` block (not as a standalone `:root` rule before `@layer base`) to keep it co-located with other CSS custom properties in the existing `:root` block. This matches the established pattern in both files. The `@layer base html` rule references `var(--app-font)`, satisfying the plan's requirement to "define `--app-font` and apply it to `html`."

## Known Stubs

None. Both stylesheets have real normalization values wired. No placeholders.

## Threat Flags

None. This is a styling-only change: no new network endpoints, no auth paths, no file access patterns, no schema changes. The threat model entry T-05-12 (per-OS rendering divergence) is now mitigated at the CSS level; per-OS visual confirmation is the manual screenshot gate in plan 05-05.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/popup/index.css exists | FOUND |
| src/dashboard/index.css exists | FOUND |
| 05-04-SUMMARY.md exists | FOUND |
| Commit 9a3c0cf exists | FOUND |
| scrollbar-width in popup | FOUND |
| ::-webkit-scrollbar in popup | FOUND |
| --app-font in popup | FOUND |
| scrollbar-width in dashboard | FOUND |
| ::-webkit-scrollbar in dashboard | FOUND |
| --app-font in dashboard | FOUND |
