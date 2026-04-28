---
phase: 1
slug: core-hibernation-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 + vitest-chrome 0.1.0 |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~15 seconds (unit) / ~45 seconds (full with E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && npx playwright test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds (unit), 45 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | FR-01, FR-02, FR-03 | — | N/A | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-02 | 01 | 0 | FR-04 | — | N/A | unit | `npx vitest run src/background/index.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-03 | 01 | 0 | COMP-01 | — | N/A | e2e | `npx playwright test tests/e2e/extension.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-04 | 01 | 1 | FR-01 | — | N/A | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-05 | 01 | 1 | FR-02 | — | N/A | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-06 | 01 | 1 | FR-03 | — | N/A | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-07 | 01 | 1 | FR-04 | — | N/A | unit | `npx vitest run src/background/index.test.ts` | ❌ Wave 0 | ⬜ pending |
| 1-01-08 | 01 | 2 | NFR-06 | — | No inline scripts; only `script-src 'self'` compliant classes | smoke | Manual: load unpacked in `chrome://extensions` | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/background/hibernation.test.ts` — stubs for FR-01 (`isDiscardable` timing), FR-02 (discard call), FR-03 (guard flags: audible, pinned, active, form, chrome://)
- [ ] `src/background/index.test.ts` — stubs for FR-04 (context menu click handler, `hibernate-current-tab` command handler)
- [ ] `tests/e2e/extension.spec.ts` — COMP-01 E2E smoke test (launchPersistentContext, extension loads, tab discarded)
- [ ] `vitest.config.ts` — vitest config with `setupFiles: ['./vitest.setup.ts']` and `environment: 'jsdom'`
- [ ] `vitest.setup.ts` — `vitest-chrome` global assignment (`chrome` mock)
- [ ] Framework install: `npm install -D vitest vitest-chrome @playwright/test` — not yet installed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extension loads without MV3 manifest errors | NFR-06 | Chrome extension loading requires a real browser session | Load unpacked from `dist/` in `chrome://extensions`; verify no errors shown in the extension card |
| Badge shows hibernated tab count (amber color) | FR-05 / D-05 | Chrome action badge requires visual inspection | Hibernate 2 tabs; verify badge shows "2" in amber/orange on extension icon |
| Ctrl+Shift+S keyboard shortcut triggers hibernation | FR-04 | Keyboard command testing requires browser focus | Open a normal tab, press Ctrl+Shift+S, verify tab is discarded (greyed out in tab strip) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
