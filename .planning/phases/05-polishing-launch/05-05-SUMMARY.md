---
phase: 05-polishing-launch
plan: "05"
subsystem: launch-docs
tags: [privacy, docs, cws, store-listing, memory-runbook, cross-os, screenshots, launch-readiness]
dependency_graph:
  requires: [05-01, 05-03, 05-04]
  provides: [PRIVACY.md, docs/MEMORY-RUNBOOK.md, docs/CROSS-OS-SCREENSHOTS.md, docs/STORE-LISTING.md]
  affects: [README.md, CWS-submission-readiness]
tech_stack:
  added: []
  patterns: [repo-root-markdown-convention, docs-directory-new, checklist-procedure-doc]
key_files:
  created:
    - PRIVACY.md
    - docs/MEMORY-RUNBOOK.md
    - docs/CROSS-OS-SCREENSHOTS.md
    - docs/STORE-LISTING.md
  modified:
    - README.md
decisions:
  - "PRIVACY.md includes source-level grep evidence (fetch/XHR/sendBeacon results = 0) to back the zero-telemetry claim (T-05-13 mitigation)"
  - "MEMORY-RUNBOOK.md designates Chrome Task Manager as the NFR-01 gate of record and explicitly states the dev probe (logMemoryProbe) is supplementary/unavailable-by-default due to missing cross-origin isolation"
  - "CROSS-OS-SCREENSHOTS.md structured as a maintainer checklist (not CI) per D-13 decision; screenshots double as CWS listing assets"
  - "STORE-LISTING.md includes CWS permission justification fields, data practices answers, and a launch checklist to prevent submission with missing artifacts"
  - "README.md: removed scripting from permission table (removed in v1.0.1 per plan 03), added PRIVACY.md + PERMISSIONS.md links, added npm run package command"
metrics:
  duration: 255s
  completed: "2026-06-22"
  tasks_completed: 1
  tasks_total: 3
  files_created: 4
  files_modified: 1
---

# Phase 05 Plan 05: Launch Documentation + Manual Verification Gates Summary

**One-liner:** Created the full CWS launch documentation package (PRIVACY.md with zero-telemetry evidence, NFR-01 Chrome Task Manager runbook, cross-OS screenshot checklist, store listing copy) and refreshed README; manual verification gates (Tasks 2 and 3) are pending human action and recorded as checkpoints below.

## What Was Built

**Task 1 — All launch docs (complete, committed)**

**PRIVACY.md** (repo root, D-10 / NFR-04):
- Zero-telemetry statement with source-level verification (grep evidence: 0 `fetch()`/`XMLHttpRequest`/`sendBeacon` in `src/`)
- Local storage inventory: every data store listed (chrome.storage.local keys + IndexedDB stores) with purpose
- On-device AI section explaining inference/learning boundaries
- Sensitive form field exclusion list (passwords, file inputs, credit-card autocomplete, OTP fields)
- Links to PERMISSIONS.md and GitHub

**docs/MEMORY-RUNBOOK.md** (D-02 gate of record):
- Six-step procedure: load build → open 50 tabs → warm Task Manager reading → wait 12+ min idle → idle Task Manager reading (gate) → verify recreation
- Explicit pass threshold: total extension RSS **< 45 MB** after idle teardown with offscreen document absent
- Warm/idle reading tables for recording actual numbers
- Failure triage table (6 scenarios)
- Probe-unavailable note: `logMemoryProbe` is DEV-only, requires cross-origin isolation (not present), is supplementary — Task Manager is the gate

**docs/CROSS-OS-SCREENSHOTS.md** (D-13 verify half / COMP-02):
- Per-OS checklists for Windows, macOS, Linux (Chrome 120+)
- 4 surfaces per OS: popup with tabs, popup empty, dashboard Stats tab, dashboard Settings tab
- Per-OS specific checks: Windows scrollbar override, macOS overlay behavior, Linux GTK theme override
- Cross-OS comparison checklist
- Screenshot naming convention (`{os}-{surface}.png`)
- Store listing asset selection guide (which captures to use for CWS upload)
- Sign-off template

**docs/STORE-LISTING.md** (D-11):
- Full CWS description (~650 words) covering all four pillars + control features
- Short description (108 chars, within 132-char limit)
- 5 feature bullets
- Screenshot plan (4 required slots + 2 optional)
- Permission justification fields for CWS dashboard
- CWS data practices Q&A answers (all "No")
- Promo tile design brief (440×280 and 920×680)
- Launch checklist (pre-submission)

**README.md** (D-12 refresh — targeted changes only):
- Removed `scripting` from permission table (permission removed in v1.0.1 per plan 03 — the old README still listed it)
- Added PRIVACY.md link in Privacy section
- Added PERMISSIONS.md link in Privacy section
- Added `npm run package` command to Development Commands section
- Updated CWS installation note to reference docs/STORE-LISTING.md

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d2d4f05 | docs | Add launch docs — PRIVACY.md, memory runbook, cross-OS checklist, store listing, README refresh |

## Manual Gate Status

### Task 2 — NFR-01 Memory Gate (PENDING — human action required)

**Status:** PENDING. Cannot be performed in this non-interactive agent environment.

**What was automated:** docs/MEMORY-RUNBOOK.md was written with the full reproducible procedure. The idle-teardown mechanism (plan 05-01) and packaging script (plan 05-03) are in place.

**Human action required:**
1. Run `npm run build` then load `dist/` as unpacked extension in Chrome 120+.
2. Open ~50 real tabs and wait 2–3 minutes for classification to run.
3. Open Chrome Task Manager (Shift+Esc) and record warm RSS (SW + Offscreen Document).
4. Stop interacting; wait at least 12 minutes.
5. Re-open Task Manager and confirm Offscreen Document is absent; record idle RSS.
6. **Gate:** total extension RSS < 45 MB = PASS; ≥ 45 MB = FAIL.
7. Report warm/idle numbers back as "approved: SW warm=XMB idle=YMB, offscreen warm=ZMB idle=gone".

**Procedure:** See `docs/MEMORY-RUNBOOK.md`.

### Task 3 — Cross-OS Screenshot Pass (PENDING — human action required)

**Status:** PENDING. Cannot be performed in this non-interactive agent environment (CI is single-OS Linux; Windows and macOS require physical or cloud machines).

**What was automated:** docs/CROSS-OS-SCREENSHOTS.md was written with the full per-OS checklist. CSS normalization (plan 05-04) applied scrollbar + font fixes to popup and dashboard.

**Human action required:**
On each of Windows, macOS, and Linux:
1. Load the built extension.
2. Capture screenshots of popup, dashboard Stats tab, dashboard Settings tab per the checklist.
3. Confirm: scrollbars are thin, fonts render via Geist→system fallback, no native-control divergence.
4. Compare side-by-side across all three OSes.
5. Report "approved" with captured screenshots or describe any per-OS inconsistencies found.

**Procedure:** See `docs/CROSS-OS-SCREENSHOTS.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] README permission table still listed removed scripting permission**
- **Found during:** Task 1 (README review, acceptance criterion: README references correct permissions)
- **Issue:** README.md Privacy section listed `scripting` permission with "Capture and restore page state" justification — `scripting` was removed from manifest.json in plan 05-03 (D-03)
- **Fix:** Replaced `scripting` row with accurate 6-permission table matching manifest.json v1.0.1; updated permission descriptions to match PERMISSIONS.md
- **Files modified:** README.md
- **Commit:** d2d4f05

None of the other deviations were needed — the docs were created as specified.

## Known Stubs

None. All four docs contain real, substantive content. No placeholder text or TODO markers.

- PRIVACY.md: real grep evidence cited (verified in plan research session)
- MEMORY-RUNBOOK.md: real procedure with specific numbers (OFFSCREEN_IDLE_MS=10min, alarm period=1min, threshold=45MB) from implemented code
- CROSS-OS-SCREENSHOTS.md: real CSS properties cited from plan 05-04 deliverables
- STORE-LISTING.md: real marketing copy (not "coming soon" placeholders)

## Threat Flags

None. This plan created documentation files only. No new network endpoints, auth paths, file access patterns, or schema changes. T-05-13 (unverified privacy claim) is now mitigated: PRIVACY.md documents the verified no-external-fetch evidence. T-05-14 (unverified RAM claim) is partially mitigated: the runbook procedure is documented; the gate is pending human execution (Tasks 2 and 3).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| PRIVACY.md exists | FOUND |
| docs/MEMORY-RUNBOOK.md exists | FOUND |
| docs/CROSS-OS-SCREENSHOTS.md exists | FOUND |
| docs/STORE-LISTING.md exists | FOUND |
| "telemetry" in PRIVACY.md | FOUND |
| "task manager" in MEMORY-RUNBOOK.md | FOUND |
| "45" in MEMORY-RUNBOOK.md | FOUND |
| "macos" in CROSS-OS-SCREENSHOTS.md | FOUND |
| "feature" in STORE-LISTING.md | FOUND |
| README.md references PRIVACY.md | FOUND |
| README.md references PERMISSIONS.md | FOUND |
| README.md references LICENSE (MIT) | FOUND |
| Commit d2d4f05 in git log | FOUND |
| Automated verification: DOCS_OK | PASS |

## Phase Completion Status

Phase 05-polishing-launch:
- Plan 05-01: COMPLETE (offscreen idle teardown + pending race guard + dev memory probe)
- Plan 05-02: (not tracked in this session)
- Plan 05-03: COMPLETE (permissions trim + manifest polish + packaging)
- Plan 05-04: COMPLETE (cross-OS CSS normalization)
- Plan 05-05: PARTIAL — Task 1 complete (docs committed); Tasks 2 and 3 are manual gates pending human action

**CWS launch package readiness:**
- Launch docs: COMPLETE (PRIVACY.md, MEMORY-RUNBOOK.md, CROSS-OS-SCREENSHOTS.md, STORE-LISTING.md, PERMISSIONS.md from plan 03)
- Packaging: COMPLETE (`npm run package` produces CWS-ready zip per plan 03)
- NFR-01 memory gate: PENDING human verification (Task 2)
- Cross-OS UI gate: PENDING human verification (Task 3)
