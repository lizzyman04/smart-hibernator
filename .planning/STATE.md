---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-05-14T07:53:03.349Z"
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 12
  completed_plans: 10
  percent: 83
---

# Project State - Smart Hibernator

## Project Reference

**Core Value**: A privacy-first, AI-powered Chrome extension that intelligently suspends inactive tabs to save RAM and battery.
**Current Focus**: Phase 2 — UI & Rich Previews
**Success Definition**: Thumbnail capture works, popup is a hibernated-tab manager, dashboard shows RAM savings graphs and settings.

## Current Position

Phase: 03 (ai-intelligence) — EXECUTING
Plan: 3 of 4
**Phase**: 3 (AI Intelligence)
**Plan**: 03-02 COMPLETE (2/4 Phase 3 plans done)
**Status**: IN_PROGRESS
**Progress**: [██████████] 100% Phase 1 + [██████████] 100% Phase 2 + [████░░░░░░] 50% Phase 3

## Performance Metrics

- **Total Requirements**: 20
- **Requirements Mapped**: 20 (100%)
- **Phases Defined**: 5
- **Plans in Phase 1**: 4 (01-01 through 01-04, all checker-verified)
- **Plans in Phase 2**: 4 (02-01 through 02-04, checker-verified 2026-05-01)
- **Next Milestone**: Phase 2 Execution
- **01-01 Duration**: 738s | Tasks: 4/4 | Files: 34 created, 2 modified
- **01-02 Duration**: 76s | Tasks: 1/1 | Files: 0 created, 1 modified
- **01-03 Duration**: 95s | Tasks: 1/1 | Files: 0 created, 1 modified
- **01-04 Duration**: 977s | Tasks: 2/2 | Files: 2 created, 4 modified
- **03-01 Duration**: 420s | Tasks: 3/3 | Files: 8 created, 4 modified
- **03-02 Duration**: 1500s | Tasks: 3/3 | Files: 2 created, 5 modified

## Accumulated Context

### Key Decisions

- **Stack Selection**: React 19 + Vite 8 + CRXJS 2.x + TypeScript + Tailwind CSS + shadcn/ui.
- **Hibernation Strategy**: Native `chrome.tabs.discard()` — no URL redirection pitfall.
- **Inference Strategy**: ONNX Runtime Web in an Offscreen Document (Phase 3, deferred).
- **Timeout**: 45 min hardcoded (`TIMEOUT_MS = 45 * 60 * 1000`).
- **Form Protection**: 5 min expiry after last input activity (`FORM_PROTECTION_MS = 5 * 60 * 1000`).
- **Tab Group Protection**: Deferred further — not in Phase 2.
- **Popup Architecture**: Popup calls `chrome.tabs.discard()` directly (documented deviation from Responsibility Map — acceptable for Phase 1).
- **Alarm tick storage read**: Single `chrome.storage.local.get([...])` call reads all 5 keys atomically to minimize race window (Pitfall 2 mitigation).
- **Discard counting**: Only non-undefined returns from `chrome.tabs.discard()` increment `hibernated_count` — Chrome returns undefined for no-op discards.
- **Zero-state display**: "No tabs hibernated" prose (Copywriting Contract adopted over UI-SPEC §6 numeric `0`).
- **vitest-chrome ESM workaround**: `import { chrome } from 'vitest-chrome/lib/index.esm.js'` — named destructure required; namespace object has no .tabs/.storage (CJS entry incompatible with vitest 4.x).
- **chrome.action MV3 mock**: Added manually to vitest.setup.ts — vitest-chrome@0.1.0 only covers MV2 browserAction; chrome.action.setBadgeText/setBadgeBackgroundColor must be vi.fn() stubs.
- **manifest.json exclude_matches removed**: Chrome enforces chrome:// injection restriction at platform level; web-ext (Firefox tool) rejects chrome://*/* as JSON_INVALID. Removing is safe and makes NFR-06 gate pass.
- **vitest.config.ts e2e exclusion**: `exclude: ['tests/e2e/**']` prevents Playwright specs from being picked up by vitest runner.
- **@types/react-dom version**: 19.2.3 used (19.2.5 does not exist on npm registry).
- **shadcn style override**: Default/gray overrides shadcn's auto-selected base-nova style to match UI-SPEC.
- **Phase 2 — Placeholder strategy**: No URL redirect; popup IS the placeholder surface. `chrome.tabs.discard()` kept from Phase 1; popup redesigned into hibernated-tab manager (D-01/D-02).
- **Phase 2 — Thumbnail capture**: `chrome.tabs.captureVisibleTab()` with `tab.active === true` guard in `onUpdated`; OffscreenCanvas for WebP compression in SW; `idb` library (module-level dbPromise singleton); IndexedDB store `smart-hibernator/thumbnails` keyed by tabId; 25 MB cap with oldest-first eviction.
- **Phase 2 — `activeTab` permission**: Required for `captureVisibleTab()`; added to manifest in Wave 0. `tabs` permission alone is insufficient.
- **Phase 2 — Dashboard**: Dedicated extension page at `src/dashboard/index.html`; requires both `rollupOptions.input` in vite.config.ts AND `web_accessible_resources` in manifest (CRXJS does not auto-add); extension_pages CSP needs `style-src 'unsafe-inline'` for Recharts Tooltip.
- **Phase 2 — Configurable timeout**: `timeout_minutes: number` in `chrome.storage.local` (default 45); `hibernation.ts` reads from storage on every alarm tick instead of using `TIMEOUT_MS` constant; no alarm recreation needed.
- **Phase 2 — Wake tab**: `chrome.tabs.update(tabId, { active: true })` auto-reloads discarded tabs; no separate `chrome.tabs.reload()` call needed.
- **Phase 2 — RAM estimate**: 150 MB per hibernated tab (conservative industry average); displayed as "~N MB freed" with tilde prefix to signal approximation.
- **shadcn CLI invocation**: Use `node node_modules/shadcn/dist/index.js add <component> --yes` — no shell binary registered in node_modules/.bin; `npx shadcn add` fails.
- **vitest.config.ts resolve.alias**: Must mirror vite.config.ts alias (`@` → `src/`) so shadcn components importing `@/lib/utils` resolve correctly in test environment.
- **chrome.storage.onChanged mock**: `addListener`/`removeListener` are real event-emitter functions in vitest-chrome (not vi.fn() spies) — never call `.mockReturnValue` on them in tests.
- **Radix Tabs JSDOM activation**: `fireEvent.mouseDown(tab, {button:0, ctrlKey:false})` required to switch tabs in tests — Radix UI Tabs v1.x listens to `onMouseDown`, not `onClick`. `fireEvent.click` alone does not trigger tab switching.
- **ResizeObserver polyfill**: Added `ResizeObserverStub` to `vitest.setup.ts` — Recharts `ResponsiveContainer` requires it; JSDOM does not implement it.
- **Phase 2 — Empty string via protocol-only input**: Use `'https://'` to test empty-domain validation when button `disabled={!domainInput.trim()}` — it strips to `''` after regex, triggering the error path while keeping button enabled.
- **Phase 3 Wave 0 — AI_CONFIDENCE_THRESHOLD**: 0.6 selected (D-07 — Claude's discretion; ~0.6 suggested in CONTEXT.md). Classifier falls back to base timeout when confidence < 0.6.
- **Phase 3 Wave 0 — AI_COLD_START_MIN_SAMPLES**: 50 rows in tab-history before AI activates (Pitfall 5 — all-zeros features would produce garbage classifications on first install).
- **Phase 3 Wave 0 — VITAL_DOMAINS preset**: github.com, docs.google.com, notion.so, linear.app, figma.com (D-02 domain heuristics).
- **Phase 3 Wave 0 — ONNX model**: synthetic Decision Tree committed (max_depth=5, seed=42, 6 float32 features, zipmap=False, 1.1 KB). All downstream waves consume committed artifact; Python not needed at runtime.
- **Phase 3 Wave 0 — All IndexedDB writes in SW only**: Offscreen Document never opens IDB connection — eliminates cross-context transaction conflicts (RESEARCH.md Q3 resolved).
- **Phase 3 Wave 1 — vi.hoisted() + vi.doMock() pattern**: vitest-idiomatic way to share mock references between vi.mock() factory and test code; avoids hoisting ReferenceError.
- **Phase 3 Wave 1 — vitest-chrome callListeners()**: onMessage.addListener is a real event emitter (not vi.fn()); use callListeners() to trigger registered listeners in tests.
- **Phase 3 Wave 1 — LABEL_ORDER**: ['Dead','Semi-Active','Vital'] matches skl2onnx training label order 0=Dead,1=Semi-Active,2=Vital from scripts/generate-model.py.
- **Phase 3 Wave 1 — classifier.ts does not apply AI_CONFIDENCE_THRESHOLD**: threshold is applied by hibernation.ts (Wave 3); classifyBatch writes all results including low-confidence ones to storage.

### Todos

- [ ] Initialize project repository with Vite + React + TypeScript.
- [ ] Configure CRXJS for Manifest V3.

### Blockers

- None.

## Session Continuity

**Last Session**: 2026-05-14 — Plan 03-02 (Wave 1 AI inference engine) executed. idb.ts bumped to v2 with tab-history + domain-bias stores + 6 CRUD helpers. offscreen/index.html replaced with real ES module entry. offscreen/main.ts created (ORT-Web session singleton, WebGPU/WASM probe, CLASSIFY_BATCH handler). classifier.ts created (getDomainCategoryBoost, buildFeaturesForTab, ensureOffscreen, classifyBatch). 3 Wave 0 test stubs expanded to real tests. npm test: 9 files, 76 passing, 4 todo, 0 failures.
**Next Session**: Execute Phase 3 Plan 03 (Wave 2 — ai-learning.ts + hibernation.ts AI integration)
**Resume file**: `.planning/phases/03-ai-intelligence/03-03-PLAN.md`
