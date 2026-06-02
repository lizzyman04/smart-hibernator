# Phase 4: Perfect State Restoration - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers **perfect state restoration** so a woken (previously discarded) tab feels as if it was never gone:

- Capture **scroll position** and **form field values** while a tab is alive.
- Persist that snapshot before the tab is discarded via `chrome.tabs.discard()`.
- On wake (Chrome reloads the discarded tab), re-inject the captured scroll + form state.
- Complete restoration in **< 600ms** of tab activation (FR-12).

Requirements: **FR-11** (capture & restore scroll position, form data, SPA state via sessionStorage) and **FR-12** (low-latency restore < 600ms).

**Not in Phase 4:**
- Re-implementing SPA state persistence — Chrome's native discard already preserves `sessionStorage` across discard/reload (we rely on it, D-02).
- Cross-session / cross-restart state survival (snapshots are tabId-scoped and deleted after restore, D-06).
- iframe / cross-origin subframe state capture (main-frame document only for this phase).
- Tab Group protection (still deferred), thumbnails (Phase 2), AI classification (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Capture Timing (FR-11)
- **D-01:** **Continuous, debounced capture.** Content script snapshots state on `scroll` and `input`/`change` events (debounced ~500ms) and performs a final flush on `pagehide` and `visibilitychange` → `hidden`. State is therefore always fresh in storage before a discard occurs — no async race between the Service Worker discarding and a just-in-time capture roundtrip.
- **D-02:** **Rely on native `sessionStorage` for SPA state.** Chrome preserves `sessionStorage` across native discard + reload, so we do **not** snapshot or re-inject it ourselves. Phase 4 explicitly captures only what native discard loses: **scroll position + form field values**. (Satisfies FR-11's "SPA state (via sessionStorage)" by leaning on the platform behavior named in the requirement.)

### Form-Data Privacy Scope (FR-11)
- **D-03:** **Capture-rest-exclude-sensitive.** Capture values from `text`/`textarea`/`select`/`checkbox`/`radio` and common text-like inputs, but **EXCLUDE**: `type="password"`, `type="hidden"`, `type="file"`, and fields whose `autocomplete` is `cc-*` (credit card), `one-time-code`, or `new-password`. All captured data stays 100% local (zero-telemetry pillar) — exclusion is defense-in-depth against persisting secrets to disk.
- **D-04:** **Field matching:** on restore, match each captured field to its element by **`id` → `name` → computed CSS-selector-path fallback**, in that order. Fields that no longer resolve are **skipped silently** (no error, no mis-fill). Index-based matching was explicitly rejected as too brittle / mis-injection-prone.

### State Storage Location & Lifecycle
- **D-05:** **Store in the existing `smart-hibernator` IndexedDB** in a **new object store** (Claude picks the store name, e.g. `tab_state`), keyed by **`tabId`**. **The Service Worker owns all IDB writes** — the content script messages the SW; the SW persists. This honors the Phase 3 invariant "all IndexedDB writes in SW only" and keeps large form payloads off the `chrome.storage.local` quota (shared with settings/classifications).
- **D-06:** **URL-validated, delete-after-restore.** Persist the page **URL** alongside each snapshot. On wake, the snapshot is applied **only if the reloaded page's URL matches** the stored URL; the entry is then **deleted** after a successful restore. Also delete on `chrome.tabs.onRemoved`. This prevents injecting stale state into the wrong page when Chrome reuses a tabId or the tab navigated away before discard.

### SPA / Async Restore & Latency (FR-12)
- **D-07:** **MutationObserver + bounded retry.** Apply restore at `document_idle`, then watch the DOM with a `MutationObserver` and re-apply for any not-yet-present fields / scroll target, until all resolve **or a ~600ms cap elapses**, then disconnect the observer. Balances "feels untouched" for lazy/SPA content against the FR-12 budget.
- **D-08:** **Content script pulls snapshot from SW.** On every `document_idle` load, the content script sends `GET_STATE { tabId, url }` to the Service Worker. The SW returns the matching snapshot or nothing; no snapshot → treat as a normal load. Reuses the established content-script → SW messaging pattern and keeps the SW as the single state owner. (SW-push-on-activation and `scripting.executeScript` injection were rejected for messaging-race / logic-duplication reasons.)

### Claude's Discretion
- Exact debounce interval constant (D-01 suggests ~500ms) and the precise retry/observer cap constant (D-07 targets ~600ms total restore budget — leave headroom under FR-12).
- New IDB object-store name and record shape (must include at least `tabId`, `url`, `scroll`, `fields[]`, `capturedAt`).
- How the content script discovers its own `tabId` (e.g., SW supplies it in the `GET_STATE` response handshake, or via `sender.tab.id` when SW initiates) — pick the cleanest given the messaging direction.
- Scroll capture granularity: window scroll vs. additionally restoring scrollable sub-containers — window/document scroll is the required minimum.
- How FR-12 (< 600ms) is measured/asserted in tests (e.g., performance.now() span around restore, or a fake-timer assertion that the observer disconnects by the cap).
- Whether to set `history.scrollRestoration = 'manual'` to avoid conflicts with the browser's native scroll restoration.
- The exact message `type` names for the new GET_STATE / capture messages (follow the existing `FORM_ACTIVITY` convention in `src/content/form-watcher.ts`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/REQUIREMENTS.md` — FR-11 and FR-12 are the Phase 4 requirements; §2.4 State Restoration and §3.1 Performance (NFR latency context)
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria (scroll restore, form re-inject, < 600ms transition), and `Depends on: Phase 1`
- `.planning/PROJECT.md` — Core pillar **Reliability** ("Perfect state restoration and MV3 native stability") and **Privacy** (zero telemetry — bounds D-03)

### Phase 1 Foundation (MUST read — Phase 4 extends the content-script + SW messaging it established)
- `.planning/phases/01-core-hibernation-engine/01-CONTEXT.md` — D-06 content-script input-activity heuristic and SW message-passing pattern that Phase 4's capture extends
- `.planning/STATE.md` — Key decisions log; note Phase 3 "All IndexedDB writes in SW only" invariant (bounds D-05), vitest-chrome / vitest-idb test workarounds, and the `idb` library singleton pattern

### Phase 2 Foundation (hibernation + storage patterns Phase 4 builds on)
- `.planning/phases/02-ui-and-rich-previews/02-CONTEXT.md` — D-01 native `chrome.tabs.discard()` (no URL redirect; page unloads on discard, Chrome reloads on wake), D-13–D-17 IndexedDB usage pattern (`idb` lib, `smart-hibernator` db, tabId-keyed, onRemoved eviction) that D-05/D-06 mirror

### Existing Code (closest analogs — read before implementing)
- `src/content/form-watcher.ts` — current content script (`<all_urls>`, `document_idle`); Phase 4 extends/augments this with scroll+form capture and the `GET_STATE` restore handshake
- `src/background/idb.ts` + `src/background/idb.test.ts` — established IndexedDB access pattern; add the new state store here
- `src/background/index.ts` — SW message router + `chrome.tabs` listeners; add capture-persist + `GET_STATE` + `onRemoved` eviction handlers
- `src/shared/types.ts` — `StorageSchema` / shared interfaces; add the new `TabStateSnapshot` type
- `manifest.json` — content_scripts already declared on `<all_urls>`; `storage`/`tabs`/`scripting` permissions already present (no new permission expected)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/content/form-watcher.ts` — content script already injected on `<all_urls>` at `document_idle` and already messages the SW (`FORM_ACTIVITY`). Phase 4 capture logic lives alongside or extends this.
- `src/background/idb.ts` — `idb`-library IndexedDB wrapper (module-level db promise singleton) used for thumbnails; add the Phase 4 state store via the same module.
- `src/shared/types.ts` — typed `getStorage`/`setStorage` helpers and shared interfaces; extend with the snapshot type.
- `src/background/index.ts` — central SW: message routing + `chrome.tabs.onRemoved`/`onUpdated`/`onActivated` listeners to hook capture-persist, `GET_STATE`, and eviction.

### Established Patterns
- **Content script → SW messaging** (`chrome.runtime.sendMessage` best-effort, SW may be starting up) — `src/content/form-watcher.ts`; replicate for capture + use request/response for `GET_STATE`.
- **All IndexedDB writes in the Service Worker only** (Phase 3 invariant in STATE.md) — content script never opens IDB; it messages the SW (bounds D-05).
- **tabId-keyed IDB records + `onRemoved` eviction** — Phase 2 thumbnail store (D-15/D-16); D-05/D-06 follow the same shape and lifecycle.
- **Native discard reload semantics** — Phase 2 D-01: discarded tab reloads its original URL on activation; capture must happen before discard, restore after the reload (drives D-01 continuous capture + D-08 pull-on-load).

### Integration Points
- `src/content/form-watcher.ts` — add scroll/form capture (debounced) + `pagehide`/`visibilitychange` flush + on-load `GET_STATE` request and restore (MutationObserver loop).
- `src/background/index.ts` — handle capture-persist messages (write via idb), `GET_STATE` responses, and `onRemoved` eviction.
- `src/background/idb.ts` — new object store for tab-state snapshots.
- `src/shared/types.ts` — new `TabStateSnapshot` interface (`tabId`, `url`, `scroll`, `fields[]`, `capturedAt`).

</code_context>

<specifics>
## Specific Ideas

- The restored tab must "feel like it was never gone" — scroll lands exactly where it was and typed-but-unsubmitted form text reappears, within the 600ms window.
- Privacy is non-negotiable: never persist passwords, OTPs, credit-card fields, or hidden tokens (D-03), even though everything stays local.
- Don't fight Chrome: `sessionStorage` and (largely) navigation are preserved by native discard — only patch the gaps (scroll + form) rather than re-implementing a full state engine (D-02).
- Stale-injection safety: a tabId can be reused by Chrome; URL-match before applying any snapshot (D-06).
- Follow the existing `FORM_ACTIVITY` message convention and `idb` singleton — new code should look like the surrounding Phase 1–3 code.

</specifics>

<deferred>
## Deferred Ideas

- **iframe / cross-origin subframe state capture** — main-frame document only for Phase 4; nested-frame restoration is a future polish item.
- **Scrollable sub-container restoration** — window/document scroll is the required minimum; restoring inner scroll containers is discretionary/future.
- **Cross-session state survival** (restore form/scroll after a full browser restart) — snapshots are tabId-scoped and deleted after restore; persistent cross-restart restoration is out of scope.
- **Just-in-time / hybrid capture before discard** — considered (D-01) and rejected in favor of continuous debounced capture; could revisit if write volume proves problematic.
- **Explicit sessionStorage snapshotting** — rejected (D-02) as redundant with native preservation; revisit only if a real edge case where Chrome drops sessionStorage is found.

None of the above block Phase 4 — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-perfect-state-restoration*
*Context gathered: 2026-06-02*
