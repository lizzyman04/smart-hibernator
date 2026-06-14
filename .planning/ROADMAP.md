# Roadmap - Smart Hibernator

## Phases

- [x] **Phase 1: Core Hibernation Engine** - Establish MV3 foundation and reliable heuristic-based tab discarding.
- [x] **Phase 2: UI & Rich Previews** - Visual feedback, thumbnails, and central savings dashboard.
- [x] **Phase 3: AI Intelligence** - Local ONNX-based tab vitality classification and dynamic timeouts. (completed 2026-05-14)
- [ ] **Phase 4: Perfect State Restoration** - Seamless wake-up with preserved scroll and form state.
- [ ] **Phase 5: Polishing & Launch** - Performance optimization, edge-case hardening, and CWS preparation.

## Phase Details

### Phase 1: Core Hibernation Engine
**Goal**: Establish a stable MV3 foundation that reliably discards tabs based on inactivity and heuristics.
**Depends on**: Nothing
**Requirements**: FR-01, FR-02, FR-03, FR-04, NFR-05, NFR-06, COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. Service Worker automatically discards inactive tabs after 45 minutes using `chrome.tabs.discard()`.
  2. Tabs playing audio, pinned, or containing unsaved forms (via simple heuristic) are exempt from auto-hibernation.
  3. User can manually trigger hibernation via a right-click context menu or `Ctrl+Shift+S`.
  4. Extension successfully loads as an MV3 extension in Chrome and Edge.
**Plans**: 4 plans (01-01, 01-02, 01-03, 01-04) — COMPLETE

### Phase 2: UI & Rich Previews
**Goal**: Enhance the user experience with visual feedback and resource management visibility.
**Depends on**: Phase 1
**Requirements**: FR-08, FR-09, FR-10
**Success Criteria** (what must be TRUE):
  1. Extension captures a compressed WebP thumbnail of a tab before it is discarded.
  2. Discarded tabs display a beautiful placeholder page showing the thumbnail and a "Wake Up" button.
  3. Dashboard displays real-time graphs of RAM and CPU savings.
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Wave 1: Foundation (deps, shadcn components, types, manifest/vite config, test stubs)
- [x] 02-02-PLAN.md — Wave 2: Service Worker backend (idb.ts, thumbnail.ts, index.ts + hibernation.ts refactor)
- [x] 02-03-PLAN.md — Wave 3: Popup redesign (hibernated-tab manager with list, Wake button, Dashboard link)
- [x] 02-04-PLAN.md — Wave 4: Dashboard page (Stats + Settings tabs, Recharts chart, slider, domain whitelist)
**UI hint**: yes

### Phase 3: AI Intelligence
**Goal**: Integrate local AI to make hibernation decisions smarter and personalized.
**Depends on**: Phase 1, Phase 2
**Requirements**: FR-05, FR-06, FR-07, NFR-02, NFR-03, NFR-04
**Success Criteria** (what must be TRUE):
  1. Offscreen Document runs ONNX Runtime Web using WebGPU/WASM acceleration.
  2. Tabs are classified into "Vital", "Semi-Active", or "Dead" based on usage history.
  3. Auto-hibernation delay varies dynamically based on AI classification confidence.
  4. No user data or behavior logs leave the device (100% local inference).
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Wave 1: Foundation (ORT deps, manifest CSP, vite static-copy, types/constants, ONNX model, test stubs)
- [x] 03-02-PLAN.md — Wave 2: Offscreen Document + classifier.ts + idb.ts v2 (tab-history, domain-bias)
- [x] 03-03-PLAN.md — Wave 3: ai-learning.ts + isDiscardable AI integration + SW behavioral hooks + KEEP_ALIVE
- [x] 03-04-PLAN.md — Wave 4: Popup V/S/D pill + Keep Alive button + Dashboard AI summary

### Phase 4: Perfect State Restoration
**Goal**: Ensure that waking a tab feels like it was never gone by restoring scroll position and form input state across the native discard/reload cycle, within 600ms.
**Depends on**: Phase 1
**Requirements**: FR-11, FR-12
**Success Criteria** (what must be TRUE):
  1. Waking a tab restores the exact scroll position it had before hibernation.
  2. Form input data is persisted and re-injected upon tab restoration.
  3. The transition from "Discarded" to "Active" completes in less than 600ms.
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Wave 1: Foundation (types, constants, IDB v3 tab-state store + CRUD, test scaffolds)
- [ ] 04-02-PLAN.md — Wave 2: SW handlers (SAVE_STATE persist, GET_STATE URL-match + delete-after-restore, onRemoved eviction)
- [ ] 04-03-PLAN.md — Wave 3: Content script (debounced capture + D-03 exclusions, GET_STATE restore, D-04 matching, bounded MutationObserver, FR-12 cap)
**UI hint**: yes

### Phase 5: Polishing & Launch
**Goal**: Maximize stability, minimize resource footprint, and prepare for public release.
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: NFR-01
**Success Criteria** (what must be TRUE):
  1. Total extension memory footprint stays below 45MB even with multiple models loaded.
  2. UI is fully responsive and consistent across Windows, macOS, and Linux.
  3. All extension permissions are verified as the absolute minimum required for functionality.
**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Hibernation Engine | 4/4 | Complete | 01-01, 01-02, 01-03, 01-04 done (2026-04-30) |
| 2. UI & Rich Previews | 4/4 | Complete | 02-01, 02-02, 02-03, 02-04 done (2026-05-03) |
| 3. AI Intelligence | 4/4 | Complete   | 2026-05-14 |
| 4. Perfect State Restoration | 1/3 | In Progress|  |
| 5. Polishing & Launch | 0/1 | Not started | - |
