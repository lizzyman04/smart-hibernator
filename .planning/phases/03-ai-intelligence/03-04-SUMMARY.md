---
phase: 03-ai-intelligence
plan: 04
subsystem: ui
tags: [popup, dashboard, ai-classification, pill-badge, keep-alive, storage-subscription, react-testing-library]

# Dependency graph
requires:
  - phase: 03-ai-intelligence
    plan: 03
    provides: "ai_classifications storage key written by classifyBatch; ai_install_date written by onInstalled; KEEP_ALIVE handler in index.ts"

provides:
  - src/popup/App.tsx: HibernatedTabRow with classification field; V/S/D pill badge per tab; Keep Alive button; ai_classifications storage subscription
  - src/dashboard/App.tsx: AI Classification card in Stats tab with V/S/D counts + learning countdown; aiClassifications/aiInstallDate in DashboardState

affects:
  - Phase 4 (state restoration — popup and dashboard are now fully AI-aware)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Separate loadHibernatedTabs storage.get for ai_classifications to decouple from current-tab query flow
    - makeStorageMock helper in tests returns same data regardless of single key vs. array of keys
    - Strict label switch (T-03-16): separate JSX conditional per label string to avoid accidental rendering on unknown values
    - ai_classifications onChanged handler maps over hibernatedTabs to update classification per row without re-querying chrome.tabs

key-files:
  created: []
  modified:
    - src/popup/App.tsx (Phase 3 Wave 3 — pill badge, Keep Alive, ai_classifications subscription)
    - src/popup/App.test.tsx (9 new Phase 3 RTL tests; 5 original tests preserved)
    - src/dashboard/App.tsx (AI Classification card in Stats tab; aiClassifications/aiInstallDate state)
    - src/dashboard/App.test.tsx (5 new Phase 3 RTL tests; 8 original tests preserved)

key-decisions:
  - "loadHibernatedTabs reads ai_classifications via a separate chrome.storage.local.get call rather than sharing state from the current-tab callback — decouples the two independent async flows and prevents ai_classifications from being undefined when loadHibernatedTabs fires first"
  - "makeStorageMock test helper returns all storage keys regardless of whether called with a string or array — avoids brittle per-call mock branching"
  - "AI Classification card placed between Recharts card and Refresh button per D-13; countdown uses AI_LEARNING_DAYS constant imported from constants.ts"
  - "No-emoji rule applied: countdown shows 'AI tuned' not 'AI tuned ✓' despite patterns file suggesting the checkmark"

# Metrics
duration: ~6min
completed: 2026-05-14
---

# Phase 3 Plan 04: Wave 3 UI — V/S/D Pill + Keep Alive + AI Dashboard Summary

**Popup tab rows now show colored V/S/D classification pills and a Keep Alive button; dashboard Stats tab shows AI Classification card with counts and learning countdown; 113 tests passing (was 99)**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-05-14
- **Tasks:** 2/2
- **Tests:** 113 passing, 0 todo (was 99 passing — net +14 new tests)
- **Files created:** 0, modified: 4

## Accomplishments

- Extended popup `App.tsx`: added `ClassificationResult` import; extended `HibernatedTabRow` with `classification: ClassificationResult | undefined`; added `aiClassifications: Record<number, ClassificationResult>` to `PopupState`; `loadHibernatedTabs` reads `ai_classifications` via its own `storage.local.get` call and attaches `classification` to each row; `storage.onChanged` listener handles `ai_classifications` changes by updating both state and all tab row classifications; V/S/D pill badges rendered with strict per-label conditional (T-03-16); Keep Alive button with `Shield` icon sends `{ type: 'KEEP_ALIVE', tabId, domain }` message
- Extended dashboard `App.tsx`: added `ClassificationResult` import, `AI_LEARNING_DAYS` constant import; extended `DashboardState` with `aiClassifications` and `aiInstallDate`; storage.local.get and onChanged listener handle both keys; derived `vitalCount`/`semiCount`/`deadCount`/`daysRemaining` computed in function body; new "AI Classification" card in Stats tab below Recharts chart with V/S/D pill badges + counts + countdown ("AI tuning: N days remaining" / "AI tuned")
- Added 9 new popup RTL tests: Vital/Semi-Active/Dead pill rendering, null-label hides pill, undefined hides pill, Keep button KEEP_ALIVE dispatch, ARIA title, live onChanged update, multiple tabs multi-pill
- Added 5 new dashboard RTL tests: count breakdown, in-progress countdown (5 days → 9 remaining), completed countdown (15 days → "AI tuned"), cold-start zeros, null-label ignored

## Task Commits

1. **Task 1: popup App.tsx + App.test.tsx** — `3117788`
2. **Task 2: dashboard App.tsx + App.test.tsx** — `be02de4`

## Files Created/Modified

- `src/popup/App.tsx` — extended with classification pill, Keep Alive button, ai_classifications subscription
- `src/popup/App.test.tsx` — 9 new Phase 3 tests (14 total; 5 original preserved)
- `src/dashboard/App.tsx` — AI Classification card in Stats tab
- `src/dashboard/App.test.tsx` — 5 new Phase 3 tests (13 total; 8 original preserved)

## Decisions Made

- `loadHibernatedTabs` reads `ai_classifications` independently (separate `storage.local.get` call) rather than depending on the current-tab callback — these two async flows are independent and coupling them caused tests to fail when the active-tab query returned empty (the storage callback was never reached, so loadHibernatedTabs was never called)
- `makeStorageMock` helper in test file handles both single-key and array-key `storage.local.get` calls with the same return value, removing brittle conditional mock logic
- No-emoji rule (global CLAUDE.md) applied to "AI tuned" — the patterns file suggested `'AI tuned ✓'` but the plan explicitly stated no checkmark emoji; using bare string `'AI tuned'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] loadHibernatedTabs decoupled from current-tab storage callback**
- **Found during:** Task 1 — first test run
- **Issue:** Original refactoring called `loadHibernatedTabs(aiClassifications)` from inside the `chrome.tabs.query({ active: true, currentWindow: true })` callback. When tests mocked `chrome.tabs.query` to return `[]` (no active tab), the `if (!tab?.id) return` guard fired early, `loadHibernatedTabs` was never invoked, and all discarded-tab tests failed with "No hibernated tabs" even when discarded tabs were present.
- **Fix:** `loadHibernatedTabs` is called independently (not inside the current-tab callback). It reads `ai_classifications` via its own `chrome.storage.local.get('ai_classifications', ...)` call inside the function body.
- **Files modified:** `src/popup/App.tsx`
- **Commit:** `3117788`

## Verification Results

1. `npm test` — 113 passing, 0 todo, 0 failures (9 files)
2. `grep -cE "KEEP_ALIVE|ai_classifications" src/popup/App.tsx` → 9 (plan requires >= 2)
3. `grep -cE "AI Classification|AI tuning|AI tuned" src/dashboard/App.tsx` → 5 (plan requires >= 3)
4. `grep -cE "bg-green-600|bg-amber-500|bg-zinc-600" src/popup/App.tsx src/dashboard/App.tsx` → 8 total (plan requires >= 6)
5. Visual verification: manual (load unpacked extension, hibernate tabs, observe V/S/D pills)

## Known Stubs

None — all Wave 3 deliverables are fully wired with real state from `ai_classifications` storage key.

## Threat Surface Scan

No new trust boundaries introduced beyond the plan's threat model. T-03-16/T-03-17/T-03-18 mitigations implemented:
- T-03-16: Strict per-label conditional rendering (three separate `{tab.classification?.label === 'Vital' && ...}` blocks) — no default case, no dynamic label, unknown values render nothing
- T-03-17: Pill data is read-only from chrome.storage.local; popup/dashboard never mutate `ai_classifications` directly
- T-03-18: Keep Alive button uses React event handler with no innerHTML; KEEP_ALIVE payload validated server-side per T-03-12 (index.ts); CSP `script-src 'self'` blocks inline injection

## Self-Check

**Files exist:**
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/popup/App.tsx` — FOUND
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/dashboard/App.tsx` — FOUND
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/popup/App.test.tsx` — FOUND
- `/home/lizzyman04/desktop/dev/cws/smart-hibernator/src/dashboard/App.test.tsx` — FOUND

**Commits exist:**
- 3117788 — Task 1: popup pill + Keep Alive + tests
- be02de4 — Task 2: dashboard AI Classification card + tests

## Self-Check: PASSED
