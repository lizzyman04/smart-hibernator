---
phase: 2
slug: ui-and-rich-previews
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + jsdom |
| **Config file** | `vitest.config.ts` (present — extends Phase 1 config) |
| **Setup file** | `vitest.setup.ts` (present — extend with `fake-indexeddb/auto`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Estimated runtime** | ~30 seconds (unit); ~120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` — all unit tests green
- **Before `/gsd-verify-work`:** Full suite (`npm test && npm run test:e2e`) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| idb-store | FR-08 | — | `putThumbnail` stores record; `getThumbnail` retrieves it | unit | `npm test -- src/background/idb.test.ts` | ❌ Wave 0 | ⬜ pending |
| idb-evict | FR-08 | — | `deleteThumbnail` removes entry on `onRemoved`; auto-prune evicts oldest when >25 MB | unit | `npm test -- src/background/idb.test.ts` | ❌ Wave 0 | ⬜ pending |
| thumbnail-compress | FR-08 | — | `compressToWebP` returns base64 string ≤ 250 KB (mocked `captureVisibleTab`) | unit | `npm test -- src/background/thumbnail.test.ts` | ❌ Wave 0 | ⬜ pending |
| popup-list | FR-09 | — | Popup renders hibernated-tab list from `chrome.tabs.query({discarded:true})` | unit (React) | `npm test -- src/popup/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| wake-button | FR-09 | — | Wake button calls `chrome.tabs.update(tabId, {active:true})` | unit (React) | `npm test -- src/popup/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| thumbnail-fallback | FR-09 | — | Thumbnail cell shows fallback card when no IndexedDB entry exists | unit (React) | `npm test -- src/popup/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| stats-metric | FR-10 | — | Stats tab computes `~{N} MB` from `hibernated_count * 150` | unit (React) | `npm test -- src/dashboard/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| timeout-slider | FR-10 | T-dom-input | Slider writes `timeout_minutes` on commit; domain input strips protocol, rejects empty/duplicate | unit (React) | `npm test -- src/dashboard/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| domain-chips | FR-10 | T-dom-input | Settings tab adds/removes entries from `protected_domains` | unit (React) | `npm test -- src/dashboard/App.test.tsx` | ❌ Wave 0 | ⬜ pending |
| alarm-timeout | D-10 | — | `handleAlarmTick` reads `timeout_minutes`; default 45 applies when key missing | unit | `npm test -- src/background/hibernation.test.ts` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/background/idb.test.ts` — covers FR-08 (IDB CRUD + eviction)
- [ ] `src/background/thumbnail.test.ts` — covers FR-08 (compression, skip inactive tab guard)
- [ ] `src/popup/App.test.tsx` — covers FR-09 (tab list render, Wake button, fallback card)
- [ ] `src/dashboard/App.test.tsx` — covers FR-10 (Stats metric, Settings slider, domain chips)
- [ ] Extend `vitest.setup.ts` — add `import 'fake-indexeddb/auto'` after existing vitest-chrome setup
- [ ] Install test deps: `npm install -D @testing-library/react @testing-library/jest-dom fake-indexeddb`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard opens in new tab when "Dashboard" button clicked | FR-10 | Requires real browser tab creation via `chrome.tabs.create()` | Load unpacked extension; click Dashboard link in popup; verify new tab opens at extension dashboard URL |
| Discarded tab reloads when Wake Tab button clicked | FR-09 | Requires real Chrome tab discard + reload behavior | Hibernate a tab; click Wake Tab in popup; verify tab becomes active and reloads |
| Thumbnail appears for a captured tab | FR-08 | `chrome.tabs.captureVisibleTab()` requires real renderer | Navigate to any HTTP/HTTPS page; wait for capture; hibernate tab; open popup; verify thumbnail displays |
| OffscreenCanvas WebP output under 25 MB cap | FR-08 | `OffscreenCanvas.convertToBlob()` behavior unverified in MV3 SW at runtime | Capture 100+ tabs; verify IndexedDB stays under 25 MB via DevTools > Application > IndexedDB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
