# Phase 5: Polishing & Launch - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers **polishing, stability hardening, and Chrome Web Store launch readiness** for the shipped Smart Hibernator (Phases 1–4 complete). It does NOT add new user-facing features — it makes what exists fit within budget, survive edge cases, and pass CWS review.

Phase 5 covers four locked workstreams:

1. **Memory footprint (NFR-01 ≤45MB)** — release the biggest RAM consumers (ONNX session + offscreen document) when idle; verify the budget.
2. **Permission minimization (NFR-05)** — drop unused permissions, justify the rest for CWS review.
3. **Edge-case hardening** — offscreen crash/recreate, restricted pages, IDB quota + SW cold-start, rapid tab churn / startup restore.
4. **CWS launch deliverables** — packaging, version/manifest polish, privacy + permission docs, store listing copy + screenshots, README/open-source polish.

Plus **cross-OS UI consistency** (success criterion 2): CSS normalization + a documented manual screenshot pass on Win/macOS/Linux.

Requirements: **NFR-01** (extension RAM ≤45MB). Also exercises NFR-05 (permission minimalism) and the Phase 5 success criteria (memory, cross-OS UI, minimum permissions).

**Not in Phase 5:**
- New features or behavior changes (hibernation logic, AI model, UI flows are frozen — only hardened/trimmed).
- Tab Group protection (still deferred from Phase 1).
- iframe / cross-origin subframe restoration (deferred in Phase 4).
- Reworking shipped features just to hit the NFR-05 four-permission ideal — we keep `activeTab` and `contextMenus` (both actively used), justified rather than removed (D-04).

</domain>

<decisions>
## Implementation Decisions

### Memory Footprint & Lifecycle (NFR-01)
- **D-01: Idle teardown + warm threshold.** The offscreen document (and the ONNX `InferenceSession` it holds) currently lives forever — created once in `classifier.ts`, never closed. Phase 5 makes it **release on idle**: keep it resident during active classification bursts, tear it down (`chrome.offscreen.closeDocument()`) only after a **longer idle window** (target ~10 min, exact constant Claude's discretion), recreate on demand for the next classification. This is the primary lever for NFR-01 since WASM runtime + model buffer dominate steady-state RAM.
- **D-02: Verify with BOTH methods.** Gate of record = **manual Chrome Task Manager** (Shift+Esc) reading of the extension's SW + offscreen + open pages under a many-tabs load, following a **documented procedure**. PLUS a **programmatic probe** (`performance.measureUserAgentSpecificMemory()`) logged in dev for regression tracking. Manual reading is the pass/fail gate; the probe is for ongoing visibility, not the gate.

### Permission Minimization (NFR-05)
- **D-03: Remove `scripting`.** Grep-confirmed zero usages of `chrome.scripting` in `src/`. Delete it from `manifest.json`. Unused powerful permissions are a known CWS-review flag. Re-add only if a future feature needs `chrome.scripting.executeScript`.
- **D-04: Justify-each for the remaining six.** Keep `storage`, `tabs`, `alarms`, `contextMenus`, `activeTab`, `offscreen` — all actively used — and document a one-line justification for each (e.g. `activeTab` → `chrome.tabs.captureVisibleTab()` thumbnail capture; `contextMenus` → manual hibernate menu). Do NOT pursue the aggressive NFR-05 four-permission ideal by removing shipped functionality. Justifications live in an in-repo doc (PERMISSIONS.md or the store-listing note) feeding the CWS submission.

### Edge-Case Hardening (all four in scope)
- **D-05: Offscreen-doc crash/recreate.** Detect when the offscreen doc is gone or crashed and recreate before classifying; explicitly guard the **idle-teardown race** introduced by D-01 (teardown must not fire while an inference is in-flight, and an in-flight request must trigger/await recreation).
- **D-06: Restricted pages.** Content script + discard path must **no-op cleanly** on `chrome://`, `chrome-extension://`, Chrome Web Store, and other injection-blocked URLs — no console errors, no failed `discard()` calls.
- **D-07: IDB quota + SW cold-start.** Handle IndexedDB **quota-exceeded** gracefully (thumbnail/state eviction, no unhandled rejection) and **SW cold-start races** (storage read before listeners are ready) without data loss.
- **D-08: Rapid tab churn / startup restore.** Fast open/close churn and browser-startup with pre-discarded tabs must not leak listeners, double-discard, or corrupt the badge count.

### CWS Launch Deliverables (all four in scope)
- **D-09: Packaging + version + manifest polish.** Production build/zip script for CWS upload, version bump, manifest metadata (description, name, `homepage_url`), icon set verified at all declared sizes (16/32/48/128).
- **D-10: Privacy + permission docs.** `PRIVACY.md` (zero-telemetry statement, NFR-04) plus the per-permission justification doc from D-04.
- **D-11: Store listing copy + screenshots.** Marketing description, feature bullets, and screenshot/promo-tile assets for the CWS listing.
- **D-12: README + open-source polish.** Public README (already rewritten recently per git log — verify/refresh), LICENSE check, contributing notes — supports the open-source pillar.

### Cross-OS UI Consistency (success criterion 2)
- **D-13: Normalize + manual screenshot pass.** Add CSS normalization for known per-OS differences (custom scrollbars, `system-ui` font-stack with fallbacks, normalized native controls) THEN a **documented manual screenshot review** on each of Windows/macOS/Linux. Both fix and verify — not verification-only.

### Claude's Discretion
- Exact idle-teardown constant for D-01 (target ~10 min; balance RAM savings vs cold-start frequency under NFR-02 ≤150ms when warm).
- Exact mechanism for the D-05 teardown-vs-in-flight guard (e.g. ref-count of pending classifications, or a "busy" flag checked before `closeDocument()`).
- Whether the memory probe (D-02) runs in the offscreen context, SW, or both; how the documented Task Manager procedure is captured (markdown runbook).
- Doc filenames/locations for D-04/D-10 (PERMISSIONS.md, PRIVACY.md) and the packaging script form (npm script vs standalone).
- Which exact restricted-URL prefixes to denylist for D-06 and whether to centralize the guard in a shared helper.
- Screenshot tooling/format for D-11 and D-13 (manual capture vs scripted), and the CSS normalization approach (Tailwind base layer vs index.css additions).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/REQUIREMENTS.md` — NFR-01 (RAM ≤45MB, the Phase 5 requirement), NFR-02 (inference ≤150ms — bounds the D-01 warm/teardown tradeoff), NFR-04 (zero telemetry — bounds D-10 PRIVACY.md), NFR-05 (permission minimalism — D-03/D-04), NFR-06 (MV3 compliance), COMP-01/COMP-02 (browser + OS targets for D-13)
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria (≤45MB, cross-OS UI consistency, minimum permissions), `Depends on: Phase 2, Phase 3, Phase 4`
- `.planning/PROJECT.md` — Core pillars **Privacy** (100% local, zero telemetry → D-10) and **Reliability** (MV3 stability → D-05–D-08)
- `.planning/STATE.md` — Accumulated key-decisions log; Phase 2/3/4 invariants (offscreen-doc usage, ONNX session singleton, IDB-in-SW-only, `idb` singleton, vitest-chrome/idb test workarounds) that Phase 5 hardening must respect

### Memory / Offscreen (D-01, D-02, D-05)
- `src/background/classifier.ts` — creates the offscreen document (`chrome.offscreen.createDocument`, ~line 119) and owns the classify-via-offscreen flow; D-01 idle-teardown + D-05 recreate/guard live here
- `src/offscreen/main.ts` — holds the `ort.InferenceSession` singleton (`session`, `getSession()`), WASM paths, model load from `src/assets/classifier.onnx`; released/recreated by the D-01 lifecycle
- `src/background/hibernation.ts` — alarm-tick classification consumer; the warm-vs-cold path interacts with D-01 teardown timing

### Permissions / Manifest (D-03, D-04, D-09)
- `manifest.json` — current permissions array (`storage`, `tabs`, `alarms`, `contextMenus`, `scripting`, `activeTab`, `offscreen`); D-03 removes `scripting`; metadata polish in D-09
- `src/background/thumbnail.ts` — `chrome.tabs.captureVisibleTab()` (justifies `activeTab`, D-04)
- `src/background/contextMenus.ts` + `src/background/index.ts` (`chrome.contextMenus`) — justifies `contextMenus` (D-04)

### Hardening targets (D-06, D-07, D-08)
- `src/content/form-watcher.ts` — content script on `<all_urls>`; needs the restricted-page no-op guard (D-06)
- `src/background/idb.ts` — IndexedDB wrapper; quota-exceeded handling (D-07)
- `src/background/index.ts` — SW message router + `chrome.tabs` listeners (`onActivated`/`onRemoved`/`onUpdated`); cold-start races, churn, startup restore, badge integrity (D-07, D-08)
- `src/background/badge.ts` — badge count correctness under churn (D-08)

### UI (D-13)
- `src/popup/App.tsx`, `src/popup/index.css`, `src/dashboard/App.tsx`, `src/dashboard/index.css` — surfaces for cross-OS normalization + screenshot pass
- `src/components/ui/*` — shadcn/ui components (scroll-area, slider, switch, etc.) whose native-control rendering varies per OS

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `chrome.offscreen.createDocument` call already centralized in `classifier.ts` (with a `creatingOffscreen` guard) — D-01 teardown + D-05 recreate extend this single chokepoint rather than scattering lifecycle logic.
- `ort.InferenceSession` already a module-level singleton in `offscreen/main.ts` with a `getSession()` accessor — natural place to null-out / re-create on teardown.
- `src/background/idb.ts` — established `idb`-library singleton wrapper; quota handling (D-07) wraps existing write paths.
- `src/background/badge.ts` — existing badge update path; D-08 asserts correctness, no new surface.

### Established Patterns
- **All IndexedDB writes in the Service Worker only** (Phase 3 invariant) — hardening must not move IDB into the offscreen/content contexts.
- **Single atomic `chrome.storage.local.get([...])` per alarm tick** (Pitfall 2 mitigation) — cold-start/churn fixes (D-07/D-08) must preserve the single-read pattern.
- **Content script messages SW best-effort** (`chrome.runtime.sendMessage`, SW may be cold-starting) — D-06 restricted-page guard sits at the top of the content script before any messaging.
- **Chrome 120 compat conventions** (callback-form messaging, literal `return true`) from Phase 4 — keep when touching SW handlers.

### Integration Points
- `classifier.ts` ↔ `offscreen/main.ts` — the offscreen lifecycle boundary where D-01/D-05 land.
- `index.ts` `chrome.tabs.*` listeners — churn/startup/cold-start hardening (D-07/D-08).
- `manifest.json` — permission removal (D-03) + metadata polish (D-09); verify no runtime code path depends on `scripting`.
- New docs (`PERMISSIONS.md`, `PRIVACY.md`) + packaging script — repo-root deliverables (D-09/D-10).

</code_context>

<specifics>
## Specific Ideas

- The offscreen document + ONNX session are the RAM that matters — Phase 5's headline win is releasing them when idle (D-01), not micro-optimizing the rest.
- `scripting` is dead weight — confirmed unused; removing it is the cleanest single permission win for CWS review (D-03).
- "Justify, don't amputate" — `activeTab` and `contextMenus` back shipped features (thumbnails, right-click hibernate); we document why we need them rather than removing functionality to chase the NFR-05 four-permission ideal (D-04).
- Hardening is comprehensive, not selective — all four failure-mode classes are in scope (D-05–D-08); the offscreen teardown race (D-05) is the one newly introduced by this phase's own D-01 change.
- Launch is a full package — engineering (packaging/manifest), docs (privacy/permissions), and listing (copy/screenshots) all ship in Phase 5 (D-09–D-12).
- Cross-OS = fix then verify — normalize CSS for scrollbars/fonts/native controls, then screenshot each OS (D-13); don't assume Tailwind handles it.

</specifics>

<deferred>
## Deferred Ideas

- **Aggressive NFR-05 four-permission ideal** — removing `activeTab`/`contextMenus` by reworking thumbnail capture and dropping the context menu was considered and rejected (D-04); revisit only if CWS review objects to the justified six.
- **Automated cross-OS visual-regression (Playwright snapshots)** — considered for D-13 but rejected as the verification method because CI runs a single OS and cannot capture real per-OS native rendering; manual per-OS screenshot pass chosen instead. Could be added later as a regression guard, not an OS-coverage tool.
- **New features / behavior changes** — out of scope; Phase 5 freezes functionality and only hardens/trims it.

None of the above block Phase 5 — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-polishing-launch*
*Context gathered: 2026-06-20*
