# Phase 5: Polishing & Launch - Research

**Researched:** 2026-06-20
**Domain:** MV3 extension hardening, memory lifecycle, Chrome Web Store launch readiness
**Confidence:** HIGH (codebase-verified) / MEDIUM (external CWS policy — fast-moving)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Idle teardown + warm threshold.** Offscreen doc (+ ONNX `InferenceSession`) currently lives forever (created once in `classifier.ts`, never closed). Make it release on idle: keep resident during active bursts, tear down (`chrome.offscreen.closeDocument()`) only after a longer idle window (target ~10 min, exact constant Claude's discretion), recreate on demand. Primary lever for NFR-01.
- **D-02: Verify with BOTH methods.** Gate of record = manual Chrome Task Manager (Shift+Esc) reading of SW + offscreen + open pages under many-tabs load, following a documented procedure. PLUS a programmatic probe (`performance.measureUserAgentSpecificMemory()`) logged in dev for regression. Manual = pass/fail gate; probe = visibility, not gate.
- **D-03: Remove `scripting`.** Grep-confirmed zero usages in `src/`. Delete from `manifest.json`.
- **D-04: Justify-each for remaining six.** Keep `storage`, `tabs`, `alarms`, `contextMenus`, `activeTab`, `offscreen` — all actively used — document one-line justification for each. Do NOT chase the four-permission ideal by removing shipped functionality. Justifications live in an in-repo doc (PERMISSIONS.md or store-listing note).
- **D-05: Offscreen-doc crash/recreate.** Detect when the offscreen doc is gone/crashed and recreate before classifying; explicitly guard the idle-teardown race from D-01 (teardown must not fire mid-inference; an in-flight request must trigger/await recreation).
- **D-06: Restricted pages.** Content script + discard path must no-op cleanly on `chrome://`, `chrome-extension://`, Chrome Web Store, and other injection-blocked URLs — no console errors, no failed `discard()` calls.
- **D-07: IDB quota + SW cold-start.** Handle IndexedDB quota-exceeded gracefully (eviction, no unhandled rejection) and SW cold-start races (storage read before listeners ready) without data loss.
- **D-08: Rapid tab churn / startup restore.** Fast open/close churn and browser-startup with pre-discarded tabs must not leak listeners, double-discard, or corrupt the badge count.
- **D-09: Packaging + version + manifest polish.** Production build/zip script for CWS upload, version bump, manifest metadata (description, name, `homepage_url`), icon set verified at all declared sizes (16/32/48/128).
- **D-10: Privacy + permission docs.** `PRIVACY.md` (zero-telemetry, NFR-04) plus the per-permission justification doc from D-04.
- **D-11: Store listing copy + screenshots.** Marketing description, feature bullets, screenshot/promo-tile assets.
- **D-12: README + open-source polish.** Public README (recently rewritten — verify/refresh), LICENSE check, contributing notes.
- **D-13: Normalize + manual screenshot pass.** Add CSS normalization for per-OS differences (custom scrollbars, `system-ui` font-stack with fallbacks, normalized native controls) THEN a documented manual screenshot review on Win/macOS/Linux. Both fix AND verify.

### Claude's Discretion

- Exact idle-teardown constant for D-01 (target ~10 min; balance RAM savings vs cold-start frequency under NFR-02 ≤150ms warm).
- Exact mechanism for the D-05 teardown-vs-in-flight guard (ref-count of pending classifications, or "busy" flag checked before `closeDocument()`).
- Whether the memory probe (D-02) runs in offscreen, SW, or both; how the Task Manager procedure is captured (markdown runbook).
- Doc filenames/locations for D-04/D-10 (PERMISSIONS.md, PRIVACY.md) and packaging script form (npm script vs standalone).
- Which exact restricted-URL prefixes to denylist for D-06 and whether to centralize the guard in a shared helper.
- Screenshot tooling/format for D-11 and D-13 (manual capture vs scripted); CSS normalization approach (Tailwind base layer vs index.css additions).

### Deferred Ideas (OUT OF SCOPE)

- Aggressive NFR-05 four-permission ideal (removing `activeTab`/`contextMenus`) — rejected (D-04); revisit only if CWS objects.
- Automated cross-OS visual-regression (Playwright snapshots) — rejected for D-13 (CI is single-OS); manual per-OS pass chosen. Could be a later regression guard, not OS-coverage tool.
- New features / behavior changes — out of scope; Phase 5 freezes functionality and only hardens/trims.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFR-01 | Extension RAM ≤ 45 MB total | D-01 offscreen idle teardown + ORT `session.release()` (Standard Stack / Pattern 1); D-02 dual measurement (Validation Architecture) |
| NFR-02 | Inference ≤ 150ms per classification (bounds D-01 tradeoff) | Warm path stays resident during bursts; idle constant ~10 min keeps cold-start reloads rare (Pattern 1, Pitfall 1) |
| NFR-04 | Zero telemetry (bounds D-10 PRIVACY.md) | Codebase verified: no `fetch` to external hosts; all I/O is `chrome.storage`/IDB/local model (Don't Hand-Roll, Privacy doc) |
| NFR-05 | Permission minimalism (D-03/D-04) | `scripting` verified unused (grep); six others verified in-use with exact call sites (Permission Justification Map) |
| NFR-06 | MV3 compliance | Already MV3; teardown/recreate use native `chrome.offscreen.*` (Pattern 1) |
| COMP-01 | Chrome 120+, Edge Chromium | Chrome 120 messaging conventions preserved (literal `return true`, callback form) — STATE.md invariant |
| COMP-02 | Windows, macOS, Linux, ChromeOS | D-13 CSS normalization + manual screenshot pass (Pattern 5, Validation Architecture) |
</phase_requirements>

## Summary

Phase 5 is a hardening + launch phase over a feature-frozen, fully-shipped extension. The single highest-leverage technical change is **D-01: tearing down the offscreen document on idle**. The offscreen document holds the ONNX `InferenceSession` plus the ORT-Web WASM runtime and the model buffer — this is the dominant steady-state RAM consumer. The decisive insight verified this session: **closing the offscreen document (`chrome.offscreen.closeDocument()`) destroys the entire JS+WASM execution context, so the OS reclaims the WASM heap regardless of whether ORT's own cleanup is perfect.** `InferenceSession.release()` (which exists and works in the installed `onnxruntime-web@1.26.0` — it calls `handler.dispose()`) is a belt-and-suspenders nicety to call before closing, but the document-close is what actually frees the memory. [VERIFIED: codebase grep of node_modules/onnxruntime-common]

The architecturally critical complication D-01 introduces is the **teardown-vs-in-flight race (D-05)**: the existing `classifier.ts` already has a `creatingOffscreen` promise guard and an `ensureOffscreen()` idempotency check via `chrome.runtime.getContexts()`. Phase 5 extends this single chokepoint with (a) a busy/ref-count guard so an idle-timer-driven `closeDocument()` cannot fire while a `CLASSIFY_BATCH` is in flight, and (b) recreation-on-demand so the next classification after teardown transparently rebuilds the document. No lifecycle logic should be scattered — it all lives in `classifier.ts` ↔ `offscreen/main.ts`.

The remaining workstreams are lower-risk and largely additive: permission trimming (`scripting` is grep-confirmed dead — clean removal), edge-case guards (a restricted-URL denylist helper, IDB quota catch, cold-start/churn listener hygiene), and launch deliverables (packaging zip, manifest metadata, PRIVACY.md/PERMISSIONS.md, store listing, README/LICENSE which already exist). Cross-OS UI consistency is a fix-then-verify CSS task plus a manual per-OS screenshot pass (automated visual-regression explicitly rejected).

**Primary recommendation:** Implement D-01/D-05 first as one coherent offscreen-lifecycle unit in `classifier.ts`+`offscreen/main.ts` (idle timer + ref-count busy guard + `release()`-then-`closeDocument()` + recreate-on-demand), validate NFR-01 via the D-02 manual Task Manager gate, then layer the additive hardening/launch tasks.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Offscreen idle teardown / recreate (D-01/D-05) | Service Worker (`classifier.ts`) | Offscreen doc (`main.ts` — `session.release()`) | SW owns lifecycle (`createDocument`/`closeDocument` only callable from SW context); offscreen only releases its own session before close |
| Memory probe (D-02) | Offscreen doc (primary RAM holder) | Service Worker (optional) | The thing we want to measure (WASM heap) lives in offscreen; probe should run where the memory is — but see cross-origin-isolation caveat (Pitfall 2) |
| Permission removal/justification (D-03/D-04) | Manifest + docs | — | Static manifest edit + in-repo markdown; no runtime tier |
| Restricted-page no-op (D-06) | Content script (`form-watcher.ts`) | Service Worker (`isDiscardable` already guards non-http) | Guard belongs at top of content script before any DOM/messaging; SW discard path already non-http-guarded |
| IDB quota handling (D-07) | Service Worker (`idb.ts`) | — | Phase 3 invariant: ALL IDB writes in SW only; quota catch wraps existing SW write paths |
| Cold-start / churn / badge (D-07/D-08) | Service Worker (`index.ts`, `badge.ts`) | — | All `chrome.tabs.*` listeners + badge live in SW |
| Packaging / zip / manifest meta (D-09) | Build tooling (Vite + script) | Manifest | Build-time; produces `dist/` → zip for CWS upload |
| Launch docs / listing (D-10/D-11/D-12) | Repo root + CWS dashboard | — | Markdown + listing assets; no runtime tier |
| Cross-OS CSS normalization (D-13) | Frontend (popup/dashboard CSS + shadcn components) | — | Browser-render tier; per-OS native-control differences |

## Standard Stack

This is a hardening phase — **no new runtime dependencies should be added.** The "stack" here is the set of native APIs and already-installed tools used to harden and ship.

### Core (already installed — versions verified this session)
| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| `onnxruntime-web` | 1.26.0 (latest 1.27.0) | ONNX inference in offscreen | Already shipped; `InferenceSession.release()` present & functional [VERIFIED: node_modules grep] |
| `chrome.offscreen` API | Chrome 109+ | Create/close offscreen doc | Native MV3; `closeDocument()` + `getContexts()` are the lifecycle primitives [CITED: developer.chrome.com/docs/extensions/reference/api/offscreen] |
| `performance.measureUserAgentSpecificMemory()` | Chrome 89+ | Dev memory probe (D-02) | Only programmatic per-context memory API; **requires cross-origin isolation** (see Pitfall 2) [CITED: MDN] |
| Chrome Task Manager (Shift+Esc) | Built-in | D-02 gate-of-record RAM reading | Reports real per-process RAM for SW + offscreen + pages; the manual pass/fail gate per D-02 |
| `@crxjs/vite-plugin` | 2.4.0 | Build → `dist/` for packaging | Already produces a loadable `dist/` (verified present) |
| `idb` | 8.0.3 | IDB wrapper (D-07 quota wrapping) | Already the singleton wrapper in `idb.ts` |

### Supporting (packaging / docs — Claude's discretion on form)
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `npm run build` (`vite build`) | Produces `dist/` | D-09 — already configured; produces manifest.json + assets |
| zip step (npm script or node script) | Package `dist/` → `.zip` for CWS upload | D-09 — CWS expects a zip of the built extension root (manifest at top level of the zip) |
| Markdown (PRIVACY.md / PERMISSIONS.md) | Launch docs | D-10 — repo-root deliverables feeding CWS dashboard fields |

**Do NOT install** `web-ext` for packaging — STATE.md records that web-ext (a Firefox tool) rejects chrome:// patterns; for CWS a plain `zip` of `dist/` is sufficient and avoids that pitfall.

**Installation:** None. Phase 5 adds zero npm dependencies. `onnxruntime-web` can optionally bump 1.26.0 → 1.27.0 but this is OUT OF SCOPE (feature-freeze; no behavior change). Leave it pinned.

**Version verification (run this session):**
- `onnxruntime-web`: installed 1.26.0, registry latest 1.27.0 [VERIFIED: npm view]
- `InferenceSession.release()`: present in installed `onnxruntime-common` `inference-session.d.ts:463`, impl calls `this.handler.dispose()` [VERIFIED: grep]

## Architecture Patterns

### System Architecture Diagram — Offscreen Lifecycle (D-01/D-05)

```
                 alarm tick (hibernation.ts)
                          │
                          ▼
                  classifyBatch() ──────────────┐  (classifier.ts)
                          │                      │
              ┌───────────▼────────────┐         │
              │ ensureOffscreen()       │         │
              │  getContexts() check    │         │
              │  ┌── exists? ──yes──┐    │         │
              │  │                  │    │         │
              │  no                 │    │         │
              │  ▼                  ▼    │         │
              │ createDocument()   reuse │         │
              │ (creatingOffscreen guard)│         │
              └───────────┬─────────────┘         │
                          │                       │
            ┌─────────────▼──────────────┐        │
            │ pending++ (busy ref-count)  │◄───────┘  ← D-05 guard:
            │ sendMessage CLASSIFY_BATCH  │              idle timer cannot
            │   → offscreen/main.ts       │              closeDocument()
            │   → ort session.run()       │              while pending>0
            │ pending--                   │
            └─────────────┬───────────────┘
                          │  arm/reset idle timer (≈10 min)
                          ▼
              ┌───────────────────────────┐
              │ idle timer fires           │
              │  pending===0 ? ──no──► skip │ ← never tear down mid-inference
              │       │ yes                 │
              │       ▼                     │
              │ message offscreen:          │
              │   session.release()         │ ← ORT dispose (belt)
              │ chrome.offscreen            │
              │   .closeDocument()          │ ← destroys WASM context (suspenders;
              └───────────────────────────┘    OS reclaims heap = NFR-01 win)
                          │
                          ▼
              next classifyBatch() recreates on demand (back to top)
```

### Recommended Code Surfaces (NOT new structure — edits to existing files)

```
src/background/classifier.ts   # D-01 idle timer + busy ref-count + teardown; D-05 recreate. THE chokepoint.
src/offscreen/main.ts          # D-01: session.release() handler + null-out singleton on teardown message
src/background/index.ts        # D-06 (no SW change needed — already non-http guarded), D-07/D-08 listener hygiene
src/background/idb.ts          # D-07 quota-exceeded catch wrapping write paths
src/background/badge.ts        # D-08 badge correctness (derive from count, already minimal)
src/content/form-watcher.ts    # D-06 restricted-URL no-op guard at TOP of file
src/shared/                    # optional: shared restricted-URL helper + denylist constant (D-06)
src/popup/index.css            # D-13 CSS normalization
src/dashboard/index.css        # D-13 CSS normalization
manifest.json                  # D-03 remove scripting; D-09 metadata (homepage_url)
PRIVACY.md / PERMISSIONS.md    # D-10 (new, repo root)
docs/MEMORY-RUNBOOK.md         # D-02 Task Manager procedure (new; location Claude's discretion)
docs/CROSS-OS-SCREENSHOTS.md   # D-13 manual screenshot checklist (new; location Claude's discretion)
package.json scripts           # D-09 packaging/zip script
```

### Pattern 1: Offscreen idle teardown with in-flight guard (D-01/D-05)
**What:** Reference-count in-flight classifications; only `closeDocument()` when count is 0 and an idle timer has elapsed; recreate transparently on next call.
**When to use:** This is THE Phase 5 pattern. The existing `ensureOffscreen()` already handles idempotent creation; extend it.
```typescript
// Source: pattern derived from chrome.offscreen docs + existing classifier.ts creatingOffscreen guard
// classifier.ts — extends the existing single chokepoint
let pending = 0                                    // D-05 busy ref-count
let idleTimer: ReturnType<typeof setTimeout> | null = null
const OFFSCREEN_IDLE_MS = 10 * 60 * 1000           // D-01 ~10 min (Claude's discretion)

function armIdleTeardown() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { teardownIfIdle().catch(() => {}) }, OFFSCREEN_IDLE_MS)
}

async function teardownIfIdle() {
  if (pending > 0) return                          // D-05: never tear down mid-inference
  // Ask offscreen to release the ORT session first (belt); then close (suspenders).
  try { await chrome.runtime.sendMessage({ type: 'RELEASE_SESSION' }) } catch { /* doc may be gone */ }
  try { await chrome.offscreen.closeDocument() } catch { /* already closed */ }
}

export async function classifyBatch(/* …existing… */): Promise<void> {
  // …existing candidate filtering…
  await ensureOffscreen()                          // recreates on demand if torn down (D-05)
  pending++                                         // enter critical section
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLASSIFY_BATCH', tabs: toClassify })
    // …existing cache write…
  } finally {
    pending--
    armIdleTeardown()                               // (re)arm idle timer after each burst
  }
}
```
> NOTE: a SW-side `setTimeout` will not fire if the SW is suspended first — that is acceptable and even desirable here: if the SW dies, the offscreen document is torn down by Chrome anyway when nothing references it, OR survives and is cheaply detected/reused by the next `getContexts()` check. The idle timer is an optimization, not a correctness requirement. The correctness requirement is the `pending` guard. Document this explicitly so the planner does not over-engineer SW-survival of the timer.

### Pattern 2: Release the ORT session before close (offscreen side, D-01)
**What:** Add a `RELEASE_SESSION` handler in `offscreen/main.ts` that calls `session.release()` and nulls the singleton so a recreated document reinitializes cleanly.
```typescript
// Source: onnxruntime-common InferenceSession.release() — verified node_modules grep
// offscreen/main.ts — add to existing onMessage listener
if (message?.type === 'RELEASE_SESSION') {
  ;(async () => {
    try { if (session) await session.release() } finally {
      session = null
      sessionInit = null           // allow clean re-init on recreate
    }
  })().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }))
  return true
}
```
> The `closeDocument()` in Pattern 1 destroys this whole context regardless — `release()` is the documented-API cleanliness step, but the memory reclaim is guaranteed by the document close, not by `release()`. State this in the plan so the success of NFR-01 does not hinge on ORT's internal cleanup.

### Pattern 3: Restricted-URL no-op guard (D-06)
**What:** A shared predicate + early-return at the top of the content script and as a guard before any `discard()`/injection.
```typescript
// Source: matches existing isDiscardable / index.ts startsWith('http') convention
// src/shared/restricted-urls.ts (new — centralize per Claude's discretion)
const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://',
  'view-source:', 'chrome-untrusted://', 'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
]
export function isInjectable(url: string | undefined): boolean {
  if (!url) return false
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  return !RESTRICTED_PREFIXES.some((p) => url.startsWith(p))
}
```
> Content script note: STATE.md records content scripts in this project are **import-free** — constants/types are inlined. The restricted-URL list must therefore be **inlined into `form-watcher.ts`** (duplicated from the shared helper), matching the existing "Content script no-import convention." Do not add an import to the content script.
> SW discard path already guards `!tab.url.startsWith('http')` in `isDiscardable` and `index.ts` — D-06's SW side is largely satisfied; the gap is the content script top-of-file guard and the CWS store URL prefixes.

### Pattern 4: IDB quota-exceeded graceful handling (D-07)
**What:** Wrap IDB writes; on `QuotaExceededError`, evict oldest (reuse existing `pruneIfNeeded`/oldest-first eviction) and retry once; never let the rejection escape.
```typescript
// Source: matches existing idb.ts pruneIfNeeded oldest-first eviction
async function putWithQuotaGuard(write: () => Promise<void>, evict: () => Promise<void>) {
  try { await write() }
  catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'QuotaExceeded')) {
      await evict().catch(() => {})
      try { await write() } catch { /* give up silently — D-07 no unhandled rejection */ }
    } // other errors already swallowed by existing .catch(() => {}) call sites
  }
}
```

### Pattern 5: Cross-OS CSS normalization (D-13)
**What:** Tailwind base-layer additions normalizing scrollbars, font-stack, and native control rendering.
```css
/* Source: standard cross-OS normalization; Tailwind v4 @layer base */
@layer base {
  /* system-ui font with explicit per-OS fallbacks (project already uses Geist variable) */
  :root { --app-font: "Geist Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  html { font-family: var(--app-font); -webkit-font-smoothing: antialiased; }
  /* Consistent thin scrollbars (Win shows fat native bars by default) */
  * { scrollbar-width: thin; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-thumb { background: rgb(0 0 0 / 0.2); border-radius: 4px; }
}
```
> The shadcn slider/switch/scroll-area are Radix-based and already render consistently (they do not use native `<input type=range>`/checkbox). The real per-OS risk is **scrollbars** (Windows fat bars vs macOS overlay) and **font metrics** (system-ui resolves to different fonts per OS). `<select>` (native dropdown) renders per-OS — audit whether any native `<select>` exists; if so it is the main control-normalization target. The project uses Radix for the documented controls, so control-normalization scope is likely small — verify during planning.

### Anti-Patterns to Avoid
- **Scattering offscreen lifecycle logic.** Do NOT add `closeDocument()` calls in `hibernation.ts` or `index.ts`. The existing `creatingOffscreen` guard proves the project's chokepoint pattern — keep teardown in `classifier.ts` too.
- **Relying on `session.release()` alone for NFR-01.** Memory reclaim must come from `closeDocument()`. `release()` is the cleanliness step, not the budget lever.
- **Tearing down on a fixed `chrome.alarms` timer.** Use a SW-side `setTimeout` reset on each burst, accepting it may not fire if SW suspends (harmless — see Pattern 1 note). Adding a new alarm just for teardown adds manifest noise and fires even mid-burst.
- **Adding `web-ext` for packaging.** STATE.md: web-ext rejects chrome:// patterns. Use plain `zip`.
- **Automated cross-OS visual regression.** Explicitly rejected (CONTEXT.md Deferred) — CI is single-OS and cannot capture real native rendering.
- **Importing modules into the content script.** Violates the project's verified no-import content-script convention (STATE.md Phase 4 Wave 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Freeing WASM heap | Manual buffer/arraybuffer nulling | `chrome.offscreen.closeDocument()` (destroys context) | OS reclaims the whole process's heap on context destruction — guaranteed, no leak chasing |
| ORT session disposal | `session.handler.dispose()` (undocumented 2022 workaround) | `session.release()` (public API in 1.26+) | The 2022 missing-dispose issue (#13391) is resolved; `release()` is public and calls `handler.dispose()` internally [VERIFIED: grep] |
| Offscreen existence check | Track a boolean flag | `chrome.runtime.getContexts()` (already used) | Survives SW restarts; a flag would desync after SW suspension (existing `ensureOffscreen` already does this) |
| Per-context memory reading | Parse `chrome://memory` HTML | Chrome Task Manager (Shift+Esc) manual + `measureUserAgentSpecificMemory()` probe | D-02 mandates exactly these two; no parsing needed |
| Oldest-first IDB eviction | New eviction logic | Existing `pruneIfNeeded()` oldest-by-`capturedAt` | Already implemented in `idb.ts` — D-07 reuses it |
| Detecting restricted pages | Regex on every URL field | Single `startsWith` denylist helper (Pattern 3) | Matches existing `startsWith('http')` convention; simple and fast |

**Key insight:** Almost every Phase 5 "problem" already has an in-repo solution (creatingOffscreen guard, getContexts check, oldest-first eviction, atomic storage read). The hardening work is mostly *extending existing chokepoints*, not building new machinery.

## Runtime State Inventory

Phase 5 includes manifest mutation (D-03 removes `scripting`) and a version bump (D-09). This is a config/packaging change, not a data rename — but the inventory below confirms no stored state breaks.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB `smart-hibernator` v3 (thumbnails, tab-history, domain-bias, tab-state) + `chrome.storage.local` keys. **None reference the `scripting` permission or any renamed string.** Removing `scripting` does not touch any stored key. | None — verified by reading `idb.ts` (no scripting dependency) and `index.ts` onInstalled keys |
| Live service config | No external services. Zero-telemetry (NFR-04) — verified no `fetch` to remote hosts in `src/`. CWS listing/dashboard fields (D-11) are set in the CWS dashboard, not git. | Set CWS dashboard fields at submission time (D-11) — manual |
| OS-registered state | `chrome.commands` keyboard shortcut `Ctrl+Shift+S` registered via manifest. Unchanged by Phase 5. | None — manifest commands block untouched |
| Secrets/env vars | None. No `.env`, no API keys (zero-telemetry). | None — verified by repo inventory |
| Build artifacts | `dist/` is git-ignored and stale (built 2026-06-14, before Phase 5 edits). D-09 packaging must `npm run build` fresh before zipping. Removing `scripting` from `manifest.json` requires a rebuild so `dist/manifest.json` reflects it. | D-09: rebuild `dist/` after manifest edit, THEN zip. Never zip the stale `dist/` |

**The canonical question — after every src file is updated, what still has the old state?** Only `dist/` (stale build) and the CWS dashboard (set at submission). Both are handled by D-09's build-then-zip step. No IDB migration, no storage migration, no OS re-registration needed. Removing `scripting` is a pure manifest deletion with zero runtime data impact.

## Common Pitfalls

### Pitfall 1: Idle teardown too aggressive → cold-start thrash violates NFR-02
**What goes wrong:** A short idle window (e.g. 30s) tears down between alarm ticks; the next tick pays full ORT session re-init (model fetch + `InferenceSession.create` + WebGPU/WASM warm-up), blowing the ≤150ms warm budget and adding latency to hibernation decisions.
**Why it happens:** Misreading "warm threshold" as "tear down as soon as idle."
**How to avoid:** ~10 min idle window (D-01 target). Alarm ticks are far more frequent than 10 min during active browsing, so the document stays warm during real usage and only tears down when the user is genuinely idle (exactly when reclaiming 40MB matters most). The DOMContentLoaded warm-up in `main.ts` already pre-initializes on recreate, masking some cold-start cost.
**Warning signs:** Repeated "session init failed"/re-init logs between ticks; D-02 probe showing offscreen RAM sawtoothing rapidly.

### Pitfall 2: `measureUserAgentSpecificMemory()` returns SecurityError without cross-origin isolation
**What goes wrong:** The D-02 probe throws `SecurityError` or returns nothing because the context is not `crossOriginIsolated`. The offscreen doc currently runs `numThreads=1` *specifically to avoid* needing SharedArrayBuffer/COOP+COEP (STATE/code comment in `main.ts`).
**Why it happens:** `measureUserAgentSpecificMemory()` requires cross-origin isolation (COOP+COEP); the extension intentionally is NOT cross-origin isolated.
**How to avoid:** **Guard the probe** — check `crossOriginIsolated` (or `globalThis.crossOriginIsolated`) and `typeof performance.measureUserAgentSpecificMemory === 'function'` before calling; log "unavailable" instead of throwing. This is exactly why D-02 makes the **Chrome Task Manager the gate of record** and the probe merely "dev visibility, not the gate." The plan must NOT add COOP+COEP isolation just to enable the probe (it would force WASM-thread reconfiguration — a behavior change, out of scope). Treat probe-unavailable as expected, not a bug. [CITED: MDN measureUserAgentSpecificMemory; web.dev cross-origin-isolation-guide]
**Warning signs:** Probe throwing on every call; temptation to add `Cross-Origin-Embedder-Policy` to manifest.

### Pitfall 3: Teardown fires mid-inference (the D-05 race)
**What goes wrong:** Idle timer fires `closeDocument()` while a `CLASSIFY_BATCH` round-trip is in flight → the offscreen `sendMessage` rejects or hangs; classification is lost.
**Why it happens:** D-01 introduces a brand-new race that did not exist before (the document used to live forever).
**How to avoid:** The `pending` ref-count in Pattern 1 — `teardownIfIdle()` early-returns when `pending > 0`. Increment before `sendMessage`, decrement in `finally`. This is the single most important correctness item Phase 5 introduces.
**Warning signs:** Intermittent classification-lost; `sendMessage` "message port closed before a response was received" errors.

### Pitfall 4: SW cold-start reads storage before listeners ready / before data written (D-07)
**What goes wrong:** On SW wake, code reads `chrome.storage.local` before `onInstalled` defaults exist, or a listener registered inside an async callback misses the event that woke the SW.
**Why it happens:** MV3 SW is ephemeral; it can be killed and restarted between any two events.
**How to avoid:** Project already follows the right patterns — ALL listeners registered synchronously at module top level (verified `index.ts`), single atomic `storage.local.get([...])` per alarm tick, `?? default` fallbacks on every read. D-07 should **audit and assert** these, not rewrite them. The one gap to check: any storage read that assumes `onInstalled` ran (cold install before defaults set) — every consumer already uses `?? default`, so risk is low. Verify `handleAlarmTick` and message handlers tolerate empty storage.
**Warning signs:** `undefined is not iterable` on fresh install; missed alarm on SW wake.

### Pitfall 5: Rapid tab churn corrupts `hibernated_count` / leaks listeners (D-08)
**What goes wrong:** Fast open/close → `onRemoved` and `onActivated` interleave; `lastActiveTabId` desyncs; double-counting discards; badge shows wrong count.
**Why it happens:** Listeners fire out of order under churn; `hibernated_count` read-modify-write in `handleAlarmTick` is not atomic across concurrent ticks.
**How to avoid:** Listeners are top-level (no per-tab listener registration → no leak — verify no `addListener` inside callbacks). Discard counting already only increments on non-`undefined` `discard()` return (STATE.md decision — Chrome returns undefined for no-op/double discard, so double-discard is naturally idempotent for the count). `lastActiveTabId` already reset in `onRemoved`. D-08 should **assert** these invariants under a churn test, plus confirm badge derives purely from the persisted count (it does — `badge.ts` is a pure function of count). Startup-restore: pre-discarded tabs on browser start should not be re-counted (they were counted when discarded).
**Warning signs:** Badge count drifting above actual hibernated tabs; count incrementing on already-discarded tabs.

### Pitfall 6: Zipping stale `dist/` for CWS (D-09)
**What goes wrong:** Packaging zips the 2026-06-14 `dist/` that still contains `scripting` and the old version, so the uploaded extension does not match source.
**Why it happens:** `dist/` is git-ignored and not auto-rebuilt by a zip script.
**How to avoid:** Packaging script MUST `npm run build` first, then zip `dist/`. Verify `dist/manifest.json` has no `scripting` and the bumped version before upload.
**Warning signs:** Uploaded extension still requests `scripting`; CWS flags an unused permission you already removed in source.

## Code Examples

### Guarded memory probe (D-02 dev visibility)
```typescript
// Source: MDN measureUserAgentSpecificMemory + cross-origin-isolation caveat
// Runs in offscreen (primary RAM holder) or SW; logs, never throws.
export async function logMemoryProbe(tag: string): Promise<void> {
  const coi = (globalThis as any).crossOriginIsolated === true
  const fn = (performance as any).measureUserAgentSpecificMemory
  if (!coi || typeof fn !== 'function') {
    console.debug(`[smart-hibernator/mem] ${tag}: probe unavailable (crossOriginIsolated=${coi}) — use Task Manager gate`)
    return
  }
  try {
    const r = await fn.call(performance)
    console.debug(`[smart-hibernator/mem] ${tag}: ${(r.bytes / 1048576).toFixed(1)} MB`, r.breakdown)
  } catch (e) {
    console.debug(`[smart-hibernator/mem] ${tag}: probe error`, e)
  }
}
```

### Recreate-on-demand is already correct (D-05)
```typescript
// Existing ensureOffscreen() in classifier.ts ALREADY handles recreate-after-teardown:
//  - getContexts() returns [] after closeDocument() → falls through to createDocument()
//  - creatingOffscreen promise guard prevents concurrent creates
// D-05 adds ONLY the pending guard around classifyBatch (Pattern 1). No change to ensureOffscreen itself.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offscreen `InferenceSession` undisposable (`handler.dispose()` workaround) | Public `InferenceSession.release()` | Resolved post-2022 (present in 1.26.0) | D-01 can call `release()` via public API; but `closeDocument()` is the real reclaim |
| Offscreen doc lives for extension lifetime | Close on idle, recreate on demand | MV3 best practice | D-01's entire premise — close to reclaim RAM |
| `measureMemory()` (old) | `measureUserAgentSpecificMemory()` (requires COI) | Chrome 89+ | D-02 probe must guard for COI; gate stays manual |

**Deprecated/outdated:**
- `chrome.offscreen.hasDocument()` — removed/replaced by `chrome.runtime.getContexts()` (the project already uses `getContexts`, so this is correct). [CITED: chromium-extensions group]
- `session.handler.dispose()` undocumented workaround — no longer needed; use `release()`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `closeDocument()` fully reclaims the offscreen WASM heap at the OS level (context destruction) | Summary / Pattern 1 | LOW — context destruction freeing process memory is standard browser behavior; D-02 manual gate empirically confirms the reclaim, so a wrong assumption is caught at the gate |
| A2 | ~10 min idle window keeps the doc warm during real browsing (alarm ticks more frequent than 10 min) | Pitfall 1 | LOW-MED — depends on the alarm period; planner should read `alarms.ts` to confirm the tick interval is well under 10 min |
| A3 | The extension is not cross-origin isolated, so the D-02 probe is often unavailable | Pitfall 2 | LOW — code comment in `main.ts` confirms numThreads=1 was chosen to avoid COI; probe-unavailable is the expected case |
| A4 | shadcn controls in use (slider/switch/scroll-area) are Radix-based and render consistently; main cross-OS risk is scrollbars + fonts (+ any native `<select>`) | Pattern 5 | MED — planner should grep popup/dashboard for native `<select>`/`<input type=range>` to size D-13 control-normalization scope |
| A5 | CWS accepts a plain zip of `dist/` with manifest at the zip root; no `web-ext` packaging needed | Standard Stack / Pitfall 6 | LOW — standard CWS upload format; STATE.md already documents web-ext incompatibility |
| A6 | Removing `scripting` requires no code change (grep-confirmed zero usages) | D-03 / Runtime State Inventory | LOW — verified `grep -rn "chrome.scripting" src/` returns nothing this session |

## Open Questions

1. **Exact alarm tick interval (affects A2 / Pitfall 1).**
   - What we know: hibernation runs on `chrome.alarms` (`ALARM_NAME`); `ensureHibernateAlarm()` in `alarms.ts` sets the period.
   - What's unclear: the exact `periodInMinutes` — needed to confirm ~10 min idle window keeps the doc warm during browsing.
   - Recommendation: planner reads `src/background/alarms.ts`; if the period is ≥10 min, raise the idle window above the alarm period so an actively-classifying browser never tears down between ticks.

2. **Scope of native form controls for D-13.**
   - What we know: shadcn slider/switch/scroll-area are Radix (consistent).
   - What's unclear: whether popup/dashboard use any raw native `<select>` or `<input type=range>` (per-OS render).
   - Recommendation: grep `src/popup` + `src/dashboard` for native controls during planning to size the normalization task.

3. **Whether the D-02 probe should ship in production builds at all.**
   - What we know: D-02 says probe is "logged in dev for regression."
   - What's unclear: gate the probe behind `import.meta.env.DEV` vs ship a no-op console.debug.
   - Recommendation: gate behind `import.meta.env.DEV` so production builds carry zero probe code (keeps NFR-04 telemetry-free posture clean and avoids dead code in the CWS package).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npm (`npm run build`) | D-09 packaging | ✓ (project builds) | per repo | — |
| `zip` CLI | D-09 zip step | likely (Linux) | — | node `archiver`/`adm-zip` if missing |
| Chrome 120+ with Task Manager | D-02 manual gate, runtime testing | ✓ (target browser) | 120+ | — |
| Windows + macOS + Linux access | D-13 manual screenshot pass | ✗ (CI single-OS; dev is Linux) | — | Manual capture on each OS by maintainer; this is the documented manual gate, not automatable |
| `onnxruntime-web` | runtime (no change) | ✓ | 1.26.0 | — |

**Missing dependencies with no fallback:**
- Simultaneous Windows/macOS/Linux access for D-13 — this is inherent to the manual-screenshot decision (CONTEXT.md rejected automation). The deliverable is a documented checklist + captured screenshots per OS, performed by whoever has each OS; the plan should treat D-13 verification as a maintainer task, not a CI task.

**Missing dependencies with fallback:**
- `zip` CLI — if absent, use a node-based zip in the packaging script.

## Validation Architecture

Nyquist validation is enabled (no `workflow.nyquist_validation` key in config → treated as enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (jsdom) + vitest-chrome 0.1.0 mocks; Playwright 1.59.1 for e2e |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (e2e), setup `vitest.setup.ts` |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npm test` (`vitest run`) |
| E2E command | `npm run test:e2e` (`playwright test`) — excluded from vitest runner |

### Phase Requirements / Decisions → Verification Map
| ID | Behavior | Verification Type | Command / Method | Exists? |
|----|----------|-------------------|------------------|---------|
| NFR-01 / D-01 | Total RAM ≤ 45MB under many-tabs load after idle teardown | **Manual gate (record)** | Chrome Task Manager (Shift+Esc) per `docs/MEMORY-RUNBOOK.md`; read SW + offscreen + pages before vs after idle window | ❌ Wave 0 (runbook) |
| NFR-01 / D-02 | Memory regression visibility | Programmatic probe | `logMemoryProbe()` guarded by crossOriginIsolated; dev-only log | ❌ Wave 0 |
| D-01 | Idle timer arms/resets; teardown only when idle | unit | `vitest` fake timers on `classifier.ts` teardown logic | ❌ Wave 0 (`classifier.test.ts` exists — extend) |
| D-05 | Teardown skipped while `pending > 0`; recreate on next call | unit | `npx vitest run src/background/classifier.test.ts` — assert no `closeDocument()` mid-flight, `ensureOffscreen` recreates after close | ❌ Wave 0 (extend existing) |
| D-03 | `scripting` absent from manifest | unit / static | assert `manifest.permissions` excludes `scripting`; grep `dist/manifest.json` post-build | ❌ Wave 0 |
| D-04 | Each kept permission has a documented justification | doc review | PERMISSIONS.md exists with 6 entries mapping to call sites | manual |
| D-06 | No-op on chrome:// / CWS / extension URLs | unit | `vitest` `isInjectable()` truth table; content-script guard returns early | ❌ Wave 0 |
| D-07 | QuotaExceededError → evict + no unhandled rejection | unit | `vitest` + fake-indexeddb: force quota error, assert eviction + resolved promise | ❌ Wave 0 (`idb.test.ts` exists — extend) |
| D-08 | Churn/startup → no double-count, badge correct | unit | `vitest` callListeners() rapid onActivated/onRemoved; assert `hibernated_count` + badge | ❌ Wave 0 (`index.test.ts` exists — extend) |
| D-09 | Build produces clean zip; manifest metadata + icons valid | smoke / manual | `npm run build` then verify `dist/manifest.json` (no scripting, version, homepage_url, 4 icons) + zip produced | ❌ Wave 0 (packaging script) |
| NFR-04 / D-10 | Zero telemetry | static | grep `src/` for external `fetch`/network — assert none; PRIVACY.md exists | partial (grep verified none this session) |
| D-13 / COMP-02 | UI consistent across Win/macOS/Linux | **Manual gate** | `docs/CROSS-OS-SCREENSHOTS.md` checklist; screenshots per OS | ❌ Wave 0 (checklist) |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>` (< 30s)
- **Per wave merge:** `npm test` (full vitest suite green)
- **Phase gate:** Full vitest suite green + D-02 manual Task Manager reading ≤45MB + D-13 per-OS screenshots captured, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `docs/MEMORY-RUNBOOK.md` — D-02 Task Manager procedure (the NFR-01 gate of record)
- [ ] `docs/CROSS-OS-SCREENSHOTS.md` — D-13 manual per-OS checklist
- [ ] Memory probe helper (`logMemoryProbe`) — D-02 dev visibility, DEV-gated
- [ ] Extend `classifier.test.ts` — D-01/D-05 idle teardown + pending-guard + recreate
- [ ] Extend `idb.test.ts` — D-07 quota-exceeded path
- [ ] Extend `index.test.ts` — D-08 churn/startup + badge integrity, D-07 cold-start tolerance
- [ ] New `restricted-urls.test.ts` (or in form-watcher.test.ts) — D-06 `isInjectable` truth table
- [ ] Manifest assertion test — D-03 scripting-absent
- [ ] Packaging script + smoke check — D-09 (no existing test infra for build artifacts)

## Security Domain

`security_enforcement` is not set to `false` in config → enabled. This is a hardening phase, so security is directly in scope (permission minimization, privacy).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth — local-only extension |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes | Permission minimization (D-03/D-04); `sender.tab.id` trust (already enforced in `index.ts` SAVE_STATE/GET_STATE — never trust message body tabId) |
| V5 Input Validation | yes | Message-type + field validation already in SW handlers (KEEP_ALIVE length checks, feature-vector length check); D-06 URL validation extends this |
| V6 Cryptography | no | No crypto; zero data leaves device |
| V7 Error Handling / Logging | yes | All async paths already `.catch(() => {})`; D-07 ensures no unhandled rejection escapes |
| V10 Malicious Code / Least Privilege | yes | D-03 removes unused `scripting` (least privilege); CWS single-purpose policy |

### Known Threat Patterns for MV3 + content-script-on-all_urls
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Spoofed tabId in cross-tab message (claim another tab's state) | Spoofing | Use `sender.tab.id` only, never message body — ALREADY enforced (T-04-04, verified `index.ts`) |
| Stale-state injection on tabId reuse | Tampering | `snapshot.url !== url` guard — ALREADY enforced (T-04-05) |
| Sensitive form-field capture (passwords/CC) | Information Disclosure | EXCLUDE_AUTOCOMPLETE + CAPTURE_INPUT_TYPES allowlist — ALREADY enforced (`form-watcher.ts`) |
| Over-broad permissions enabling abuse | Elevation of Privilege | D-03 remove `scripting`; D-04 justify the rest; CWS least-privilege review |
| Content script errors on restricted pages leaking stack/info | Information Disclosure | D-06 no-op guard — no console errors on chrome:// |
| Unbounded IDB growth (local DoS) | Denial of Service | D-07 quota handling + existing oldest-first eviction + 14-day history prune |

**Note:** Phase 5 adds NO new attack surface (feature-frozen). The security work is *reductive* (remove `scripting`, document privacy) and *defensive hardening* of existing surfaces. The strong message-validation patterns from Phases 3–4 are already in place and must be preserved when touching SW handlers.

## Project Constraints (from CLAUDE.md)

No project-level `./CLAUDE.md` exists in the repo (only the user's global `~/.claude/CLAUDE.md`, which concerns the RTK CLI proxy and is environment-tooling, not project code constraints). No `.claude/skills/` or `.agents/skills/` directories found. Constraints therefore come from STATE.md invariants (treated with locked-decision authority):

- ALL IndexedDB writes in the Service Worker only (Phase 3 invariant) — D-07 must not move IDB into offscreen/content.
- Single atomic `chrome.storage.local.get([...])` per alarm tick — D-07/D-08 must preserve the single-read pattern.
- Content scripts are import-free (constants/types inlined) — D-06 restricted-URL list inlined into `form-watcher.ts`.
- Chrome 120 compat: callback-form messaging + literal `return true` in SW handlers — preserve when touching handlers.
- All listeners registered synchronously at SW module top level — never inside async callbacks.
- vitest-chrome quirks: `chrome.action` manually mocked; `onMessage`/`onChanged` `addListener` are real emitters (use `callListeners()`, never `.mockReturnValue`).

## Sources

### Primary (HIGH confidence)
- Codebase (this session): `classifier.ts`, `offscreen/main.ts`, `index.ts`, `idb.ts`, `hibernation.ts`, `badge.ts`, `form-watcher.ts`, `manifest.json`, `vite.config.ts`, `package.json`, STATE.md — direct read + grep
- `node_modules/onnxruntime-common/dist/cjs/inference-session*.d.ts|.js` — verified `release()` present, calls `handler.dispose()`
- `npm view onnxruntime-web version` — 1.27.0 latest; installed 1.26.0
- chrome.offscreen API docs — closeDocument/getContexts/lifetime/single-doc/WORKERS [developer.chrome.com/docs/extensions/reference/api/offscreen]

### Secondary (MEDIUM confidence)
- MDN `Performance.measureUserAgentSpecificMemory()` — cross-origin-isolation requirement [developer.mozilla.org]
- web.dev cross-origin-isolation guide + monitor-total-page-memory-usage
- Chrome Web Store review process / troubleshooting — permission justification, single purpose, privacy disclosure, unused-permission flags [developer.chrome.com/docs/webstore]
- chromium-extensions group — offscreen lifecycle, hasDocument removal

### Tertiary (LOW confidence — verify at submission)
- Third-party CWS-policy blogs (2026 review-time, privacy-policy templates) — directional only; cross-check against official CWS docs at submission

## Metadata

**Confidence breakdown:**
- Offscreen lifecycle / teardown (D-01/D-05): HIGH — codebase chokepoint verified, offscreen API + ORT release() verified, mechanism is standard
- Memory measurement (D-02): HIGH — COI caveat verified via MDN; gate is manual by decision
- Permission trim (D-03/D-04): HIGH — grep-confirmed unused scripting + verified call sites for the six
- Edge-case hardening (D-06/D-07/D-08): HIGH — existing patterns read directly; work is assert+extend
- CWS launch requirements (D-09/D-11): MEDIUM — official docs read, but CWS policy/review specifics shift; verify at submission
- Cross-OS CSS (D-13): MEDIUM — Radix consistency assumed; needs native-control grep during planning

**Research date:** 2026-06-20
**Valid until:** ~2026-07-20 for stable APIs (offscreen, ORT); ~2026-07-05 for CWS policy specifics (fast-moving — re-verify at submission)
