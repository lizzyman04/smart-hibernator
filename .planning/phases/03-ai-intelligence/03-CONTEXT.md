# Phase 3: AI Intelligence - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 wires a local ONNX-based classifier into the hibernation decision loop. Instead of a flat inactivity timeout for all tabs, each tab is classified as **Vital**, **Semi-Active**, or **Dead** based on behavioral signals, and the hibernation delay is scaled accordingly. Everything runs locally; zero data leaves the device.

Deliverables:
- **Behavioral signal collection** — per-tab/per-domain history (revisit frequency, dwell time, form activity, domain category) stored in IndexedDB for a 14-day rolling window
- **ONNX classifier** — Offscreen Document running ORT-Web (WebGPU primary, WASM fallback) producing Vital/Semi-Active/Dead classification with confidence score
- **Dynamic timeout integration** — `handleAlarmTick()` reads classification before deciding to discard; Vital = never hibernate, Semi-Active = 1.5× base timeout, Dead = 0.5× base timeout; low confidence falls back to base timeout
- **Learning mechanism** — implicit feedback from wake events + explicit "Keep Alive" button; updates per-domain classification thresholds in IndexedDB (no model weight retraining)
- **Cold start handling** — while insufficient behavioral data exists, AI is skipped entirely; flat base timeout used
- **UI exposure** — V/S/D colored pill badge on popup tab rows; AI summary section added to dashboard Stats tab

**Not in Phase 3:**
- Model weight retraining in-browser
- User-adjustable multipliers for Semi-Active / Dead timeouts
- Explicit per-domain Force Vital / Force Dead overrides in Settings (Keep Alive doubles as override)
- Tab Group protection (still deferred)
- State restoration (Phase 4)

</domain>

<decisions>
## Implementation Decisions

### Vitality Signal Model
- **D-01:** Primary signal is a **combined score** — weighted blend of revisit frequency (how often the domain/URL is returned to), dwell time (time spent on tab), and form activity (from existing `lastFormActivity` in `tab_meta`). No single signal dominates.
- **D-02:** **Domain heuristics** are included as a signal — preset category boosts for domains known to be vital (docs.*, github.com, productivity tools) or dead (news/media after read). User's existing domain whitelist in Settings can surface as a strong-Vital override.
- **D-03:** Behavioral history stored in **IndexedDB** (existing `idb.ts` infra). Per-domain and per-tab history rows covering a **14-day rolling window**. `chrome.storage.local` is not used for this — 10 MB quota is insufficient for power users with 100+ tabs.

### Dynamic Timeout Mapping
- **D-04:** **Vital** classification → tab is **never auto-hibernated** (treated identically to a pinned tab; `isDiscardable()` returns false).
- **D-05:** **Semi-Active** classification → hibernation delay = **1.5× `timeout_minutes`** (e.g., 67 min at 45-min base).
- **D-06:** **Dead** classification → hibernation delay = **0.5× `timeout_minutes`** (e.g., 22 min at 45-min base).
- **D-07:** When classifier confidence falls below threshold (implementation detail — Claude picks sensible value ~0.6), **fall back to base `timeout_minutes`** exactly as if AI is absent. No degraded partial classification.
- **D-08:** Multipliers (1.5× and 0.5×) are **hardcoded in Phase 3** — no sliders or user-adjustable values. Base timeout slider in Settings already gives user control over the scale.

### Learning Mechanism
- **D-09:** Learning triggers are **both implicit and explicit**:
  - *Implicit*: when a hibernated tab is woken within a short window of being discarded, that wake event is recorded as a misclassification signal for the domain
  - *Explicit*: user taps a **"Keep Alive"** button (new, in popup tab list row) to provide a strong positive Vital signal for that domain
- **D-10:** Adaptation is **per-domain threshold adjustment** — the ONNX model's weights remain static (bundled); only the domain-level classification bias/boost values stored in IndexedDB are updated. No in-browser model retraining.
- **D-11:** **Cold start**: if behavioral history is insufficient (fewer than a Claude-decided minimum number of samples), **AI classification is skipped entirely** and the flat base `timeout_minutes` is used. Same code path as the low-confidence fallback.

### AI Visibility in UI
- **D-12:** Popup tab list rows show a **small colored pill badge** for each tab's classification: `V` (green) for Vital, `S` (amber) for Semi-Active, `D` (gray) for Dead. Subtle, not intrusive.
- **D-13:** Dashboard **Stats tab gets an AI summary section** (added below existing RAM/hibernation charts): shows classification breakdown (N Vital / M Semi-Active / K Dead tabs today) and learning status (e.g., "AI tuning: 12 days remaining").
- **D-14:** **"Keep Alive" button doubles as AI override** — no separate Force Vital / Force Dead control needed. Repeatedly marking a tab Keep Alive biases its domain permanently toward Vital in the learned thresholds.

### Claude's Discretion
- ONNX model architecture and initial training data source (synthetic rule-based model vs. pre-trained; Claude picks the approach that fits MV3 bundle size constraints)
- Feature vector format and normalization strategy
- Offscreen Document ↔ Service Worker message protocol (request/response shape, batching)
- WebGPU vs. WASM fallback detection and switching logic (NFR-03 mandates WebGPU/SIMD)
- Specific confidence threshold value for fallback (~0.6 suggested)
- Cold start minimum sample count before AI activates
- IndexedDB schema for behavioral history (exact store name, index structure)
- Wake event "short window" duration for misclassification signal

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/REQUIREMENTS.md` — FR-05 (classification), FR-06 (learning mode), FR-07 (dynamic timeouts), NFR-02 (≤ 150ms inference), NFR-03 (WebGPU/SIMD), NFR-04 (zero telemetry)
- `.planning/ROADMAP.md` — Phase 3 goal, success criteria, and dependencies (Phase 1 + Phase 2 complete)
- `.planning/PROJECT.md` — Core pillars: Privacy (100% local) and Intelligence (smart hibernation)

### Prior Phase Foundations (MUST read — Phase 3 extends these)
- `.planning/phases/01-core-hibernation-engine/01-CONTEXT.md` — Locked Phase 1 decisions: `isDiscardable()` contract, alarm tick pattern, storage schema
- `.planning/phases/02-ui-and-rich-previews/02-CONTEXT.md` — Locked Phase 2 decisions: popup architecture, IndexedDB/idb.ts pattern, dashboard page structure, Keep Alive UX context
- `.planning/STATE.md` — Key decisions log: idb singleton pattern, vitest-chrome workarounds, CRXJS patterns, Phase 2 deviations

### Architecture
- `.planning/research/ARCHITECTURE.md` — Service Worker centric architecture; Offscreen Document pattern; anti-patterns (no setTimeout in SW, no persistent storage in SW)
- `.planning/research/STACK.md` — Technology stack decisions; ORT-Web already listed as AI engine

### Source Files (integration points)
- `src/background/hibernation.ts` — `isDiscardable()` and `handleAlarmTick()` — Phase 3 integrates AI classification here; read before modifying
- `src/background/index.ts` — SW entry point; Offscreen Document creation must go here (top-level listener registration rule)
- `src/background/idb.ts` — Existing IndexedDB wrapper; new behavioral history store adds alongside `thumbnails`
- `src/shared/types.ts` — `StorageSchema` and `TabMeta`; Phase 3 extends both
- `src/popup/App.tsx` — Popup tab list; Phase 3 adds V/S/D badge to each hibernated-tab row
- `src/dashboard/App.tsx` — Dashboard Stats tab; Phase 3 adds AI summary section

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/background/idb.ts` — module-level `dbPromise` singleton pattern; replicate for new behavioral history store (`smart-hibernator/tab-history`)
- `src/components/ui/badge.tsx` — shadcn Badge; use for V/S/D classification pill in popup rows
- `src/components/ui/button.tsx` — shadcn Button; use for "Keep Alive" button in popup tab row
- `src/lib/utils.ts` — `cn()` Tailwind class merge; use in all new components
- `src/shared/types.ts` — `StorageSchema` / `TabMeta` interfaces; extend for AI classification state
- `src/background/storage.ts` — `getStorage` / `setStorage` typed helpers; use for all storage reads

### Established Patterns
- **Alarm tick atomic read** — `chrome.storage.local.get([...])` reads all keys in one call (Pitfall 2 mitigation); Phase 3 adds classification result to this read
- **Offscreen Document** — must be created via `chrome.offscreen.createDocument()` in SW; communication via `chrome.runtime.sendMessage()`; SW cannot import ORT-Web directly
- **`idb` library singleton** — `const dbPromise = openDB(...)` at module top level; never inside event handlers
- **Top-level listener registration** — ALL `chrome.*` listeners must register synchronously at SW module top level (see index.ts comment)
- **CRXJS bundling** — new entry points (offscreen HTML) need `rollupOptions.input` in `vite.config.ts` and `web_accessible_resources` in `manifest.json`

### Integration Points
- `src/background/hibernation.ts:isDiscardable()` — add classification lookup; if Vital, return false; if Semi-Active/Dead, adjust `timeoutMs` before inactivity check
- `src/background/index.ts` — add `chrome.tabs.onActivated` / `onUpdated` hooks to record behavioral events; add Offscreen Document initialization
- `src/background/idb.ts` — add `smart-hibernator/tab-history` object store for behavioral signal rows
- `src/popup/App.tsx` — add V/S/D pill to each hibernated tab row; add "Keep Alive" button
- `src/dashboard/App.tsx` — add AI summary section below Recharts charts in Stats tab

</code_context>

<specifics>
## Specific Ideas

- The V/S/D pill in popup should be color-coded: Vital = green, Semi-Active = amber, Dead = gray — consistent with traffic-light semantics users already understand
- The "Keep Alive" button in the popup row should be distinct from the "Wake" button — different icon/label so user understands it's a signal, not just waking the tab
- Dashboard AI summary: "AI tuning: X days remaining" counts down from install date; at 0, shows "AI tuned ✓"
- The cold start period communicates to the user via the Stats tab ("AI learning — N more days of data needed") rather than silently degrading
- ORT-Web WASM fallback must be tested — not all Chrome builds have WebGPU; extension should degrade gracefully per NFR-03

</specifics>

<deferred>
## Deferred Ideas

- **Model weight retraining in-browser** — computationally expensive, complex to implement in MV3 Offscreen Document. Post-Phase 3 or Phase 5 polish candidate.
- **User-adjustable Semi-Active / Dead multipliers** — sliders in Settings tab. Deferred for Phase 5 polish.
- **Explicit Force Vital / Force Dead per-domain overrides** — Keep Alive button covers the primary use case. Phase 5 power-user settings candidate.
- **Per-tab RAM measurement** — system API not available in MV3 (noted in Phase 2 context); still deferred.

</deferred>

---

*Phase: 03-ai-intelligence*
*Context gathered: 2026-05-11*
