---
phase: 5
slug: polishing-launch
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-20
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 (jsdom) + vitest-chrome 0.1.0 mocks; fake-indexeddb for IDB; Playwright 1.59.1 for e2e (not used this phase) |
| **Config file** | `vitest.config.ts` (setup `vitest.setup.ts`) — already present |
| **Quick run command** | `npx vitest run <touched test file>` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~20–40 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>` (< 30s)
- **After every plan wave:** Run `npm test` (full vitest suite green)
- **Before `/gsd-verify-work`:** Full vitest suite green + D-02 manual Task Manager reading ≤45MB + D-13 per-OS screenshots captured
- **Max feedback latency:** ~40 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | NFR-01 | T-05-03 | Mem probe DEV-gated, never throws when not COI | unit/static | `npx vitest run src/shared; grep OFFSCREEN_IDLE_MS` | ✅ (constants), ❌ W0 (mem-probe) | ⬜ pending |
| 05-01-02 | 01 | 1 | NFR-01 | T-05-04 | RELEASE_SESSION nulls session+sessionInit even on reject | unit | `npx vitest run src/offscreen/main.test.ts` | ✅ extend | ⬜ pending |
| 05-01-03 | 01 | 1 | NFR-01 | T-05-01 / T-05-02 | No teardown while pending>0; recreate on next classify | unit | `npx vitest run src/background/classifier.test.ts` | ✅ extend | ⬜ pending |
| 05-02-01 | 02 | 1 | NFR-01 | T-05-05 | Content script no-ops on restricted URLs, no console errors | unit | `npx vitest run src/shared/restricted-urls.test.ts src/content/form-watcher.test.ts` | ❌ W0 (restricted-urls), ✅ extend (form-watcher) | ⬜ pending |
| 05-02-02 | 02 | 1 | NFR-01 | T-05-06 | QuotaExceededError → evict + retry, no unhandled rejection | unit | `npx vitest run src/background/idb.test.ts` | ✅ extend | ⬜ pending |
| 05-02-03 | 02 | 1 | NFR-01 | T-05-07 / T-05-08 | Churn/startup no double-count; badge pure; sender.tab.id | unit | `npx vitest run src/background/index.test.ts` | ✅ extend | ⬜ pending |
| 05-03-01 | 03 | 1 | NFR-01 | T-05-09 | scripting absent; permission set pinned | unit/static | `npx vitest run src/background/manifest.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 1 | NFR-01 | T-05-11 | Each kept permission justified to a call site | doc/static | `test -f PERMISSIONS.md && grep captureVisibleTab` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 1 | NFR-01 | T-05-10 | Build-then-zip; refuse stale dist with scripting | smoke/static | `node -e package-script-check` + `npm run package` smoke | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 1 | NFR-01 | T-05-12 | Scrollbar + font normalization; build compiles | static/build | `grep scrollbar-width` both CSS + `npx vite build` | ✅ extend | ⬜ pending |
| 05-05-01 | 05 | 2 | NFR-01 / NFR-04 | T-05-13 | Zero-telemetry documented with evidence; runbook | doc/static | `test -f` + grep gates (PRIVACY/RUNBOOK/SCREENSHOTS/LISTING) | ❌ W0 | ⬜ pending |
| 05-05-02 | 05 | 2 | NFR-01 | T-05-14 | Total RAM < 45MB after idle teardown (gate of record) | **manual gate** | Chrome Task Manager per docs/MEMORY-RUNBOOK.md | n/a (manual) | ⬜ pending |
| 05-05-03 | 05 | 2 | COMP-02 | T-05-12 | UI consistent across Win/macOS/Linux | **manual gate** | Per-OS screenshots per docs/CROSS-OS-SCREENSHOTS.md | n/a (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Most test files already exist (extend in place). New files created during their owning task (TDD test-first):

- [ ] `src/shared/mem-probe.ts` — D-02 dev probe, DEV-gated (created in 05-01-01)
- [ ] `src/shared/restricted-urls.ts` + `src/shared/restricted-urls.test.ts` — D-06 isInjectable truth table (created in 05-02-01)
- [ ] `src/background/manifest.test.ts` — D-03 scripting-absent + metadata assertions (created in 05-03-01)
- [ ] `PERMISSIONS.md` — D-04 justification doc (created in 05-03-02)
- [ ] `scripts/package.mjs` — D-09 build-then-zip (created in 05-03-03)
- [ ] `PRIVACY.md`, `docs/MEMORY-RUNBOOK.md`, `docs/CROSS-OS-SCREENSHOTS.md`, `docs/STORE-LISTING.md` — D-10/D-02/D-13/D-11 (created in 05-05-01)
- [ ] Extend existing: `classifier.test.ts`, `offscreen/main.test.ts`, `idb.test.ts`, `index.test.ts`, `form-watcher.test.ts` — extended in their owning tasks

*Existing infrastructure (vitest + vitest-chrome + fake-indexeddb) covers all automated phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Total extension RAM < 45MB after idle teardown under ~50-tab load | NFR-01 (gate of record) | CWS-relevant RAM measurement is a Chrome Task Manager reading; the programmatic probe requires cross-origin isolation the extension intentionally avoids (Pitfall 2) | docs/MEMORY-RUNBOOK.md — warm read, wait past ~10min idle window, idle read, confirm offscreen process gone + total < 45MB (05-05-02) |
| UI consistent across Windows / macOS / Linux | COMP-02 / success criterion 2 | CI is single-OS and cannot render real per-OS native scrollbars/fonts; automated visual-regression explicitly rejected (CONTEXT Deferred) | docs/CROSS-OS-SCREENSHOTS.md — capture popup + dashboard surfaces on each OS, confirm scrollbar/font/control consistency (05-05-03) |
| `npm run package` produces a CWS-ready zip from fresh build | D-09 | Full build-then-zip needs a clean build environment; the script's structure + stale-dist guard are asserted automatically | `npm run package`; verify zip produced and dist/manifest.json has no scripting (05-03-03 smoke) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are explicit manual gates with Wave 0 doc dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (only the two final tasks are manual gates, by decision)
- [x] Wave 0 covers all MISSING references (new files created test-first in owning tasks)
- [x] No watch-mode flags (all `vitest run`)
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20
