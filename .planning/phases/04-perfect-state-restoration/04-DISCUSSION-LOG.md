# Phase 4: Perfect State Restoration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 04-perfect-state-restoration
**Areas discussed:** Capture timing, Form-data privacy scope, State storage location, SPA / async restore

---

## Capture Timing — when to snapshot

| Option | Description | Selected |
|--------|-------------|----------|
| Continuous, debounced | Capture on scroll/input (debounced ~500ms) + flush on pagehide/visibilitychange:hidden. Always fresh before discard; no async race. | ✓ |
| Just-in-time before discard | SW messages content script before discard, awaits ack. Minimal writes, risky roundtrip. | |
| Hybrid | Debounced continuous + best-effort JIT flush. Belt-and-suspenders, more code. | |

**User's choice:** Continuous, debounced (→ D-01)
**Notes:** Avoids the discard race entirely; state is persisted before discard ever fires.

## Capture Timing — SPA state handling

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on native sessionStorage | Chrome preserves sessionStorage across native discard/reload; capture only scroll + form. | ✓ |
| Snapshot sessionStorage too | Explicitly read & re-inject; largely redundant, adds payload + privacy surface. | |

**User's choice:** Rely on native sessionStorage (→ D-02)
**Notes:** Matches FR-11's "SPA state (via sessionStorage)" by leaning on platform behavior.

---

## Form-Data Privacy Scope — what to capture

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude sensitive, capture rest | Capture text/textarea/select/checkbox/radio; exclude password, hidden, file, cc-*, one-time-code, new-password. | ✓ |
| Capture all except passwords | Skip only password & file. Simpler, but persists hidden tokens/CC/OTP locally. | |
| Opt-in form restore | Default OFF; user enables in settings. Max privacy, weakens "perfect restoration". | |

**User's choice:** Exclude sensitive, capture rest (→ D-03)
**Notes:** All data stays 100% local; exclusion is defense-in-depth against persisting secrets to disk.

## Form-Data Privacy Scope — field matching on restore

| Option | Description | Selected |
|--------|-------------|----------|
| Stable attrs + CSS path fallback | id → name → computed CSS selector path; skip unresolved fields. | ✓ |
| id/name only | Match only fields with id/name; ignore anonymous. Safest, misses some fields. | |
| Index-based | Match by querySelectorAll index. Cheap but brittle, risks mis-fill. | |

**User's choice:** Stable attrs + CSS path fallback (→ D-04)
**Notes:** Index-based explicitly rejected as mis-injection-prone.

---

## State Storage Location — where the blob lives

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB, SW-owned | New store in smart-hibernator IDB, keyed by tabId; content script messages SW, SW writes. | ✓ |
| chrome.storage.local | New key under shared 10MB quota; bloats with form text. | |
| Content script writes IDB directly | Page-context IDB connection; breaks SW-owned-writes invariant. | |

**User's choice:** IndexedDB, SW-owned (→ D-05)
**Notes:** Honors Phase 3 "all IDB writes in SW only" invariant; mirrors Phase 2 thumbnail pattern.

## State Storage Location — lifecycle & stale guard

| Option | Description | Selected |
|--------|-------------|----------|
| URL-validated, delete after restore | Store url; restore only on URL match; delete after restore + on onRemoved. | ✓ |
| Delete after restore, no URL check | Simpler, but risks filling wrong page's form if tab navigated. | |
| Keep until tab close only | Survives repeated cycles, grows storage, stale-injection risk. | |

**User's choice:** URL-validated, delete after restore (→ D-06)
**Notes:** Guards against Chrome reusing a tabId or the tab having navigated before discard.

---

## SPA / Async Restore — handling not-yet-present elements

| Option | Description | Selected |
|--------|-------------|----------|
| MutationObserver + bounded retry | Apply at document_idle, observe + re-apply until resolved or ~600ms cap, then disconnect. | ✓ |
| Single-shot at document_idle | Apply once, skip missing. Fastest, but misses lazy/SPA content. | |
| Fixed short retries | Retry on a 0/150/300/500ms timer. Simpler, wastes cycles, may miss slow mounts. | |

**User's choice:** MutationObserver + bounded retry (→ D-07)
**Notes:** Balances SPA correctness against the FR-12 < 600ms budget.

## SPA / Async Restore — restore trigger / snapshot retrieval

| Option | Description | Selected |
|--------|-------------|----------|
| Content script pulls from SW | On document_idle, content script sends GET_STATE{tabId,url}; SW returns snapshot or nothing. | ✓ |
| SW pushes on activation | SW sends RESTORE_STATE on onActivated; risks content script not ready. | |
| SW injects via scripting.executeScript | One-off injected restore script; duplicates restore logic, timing-sensitive. | |

**User's choice:** Content script pulls from SW (→ D-08)
**Notes:** Reuses existing messaging; SW stays single state owner.

---

## Claude's Discretion

- Exact debounce interval (~500ms) and restore retry/observer cap constant (target < 600ms FR-12).
- New IDB object-store name and record shape (`tabId`, `url`, `scroll`, `fields[]`, `capturedAt`).
- How content script learns its own tabId (handshake in GET_STATE response vs sender.tab.id).
- Scroll capture granularity (window/document required; sub-containers discretionary).
- FR-12 latency measurement strategy in tests.
- Whether to set `history.scrollRestoration = 'manual'`.
- Exact message `type` names (follow `FORM_ACTIVITY` convention).

## Deferred Ideas

- iframe / cross-origin subframe state capture — main-frame only this phase.
- Scrollable sub-container restoration — window/document scroll is the minimum.
- Cross-session / cross-restart state survival — out of scope; snapshots are tabId-scoped.
- Just-in-time / hybrid capture before discard — considered and rejected (D-01).
- Explicit sessionStorage snapshotting — rejected (D-02) as redundant with native preservation.
