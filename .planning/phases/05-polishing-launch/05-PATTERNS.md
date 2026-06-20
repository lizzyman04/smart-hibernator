# Phase 5: Polishing & Launch - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 16 (13 modified, 5–6 new)
**Analogs found:** 13/13 modified files are their own analog (self-analog); new files map to existing patterns

> **Phase nature:** This is a HARDENING + LAUNCH phase over a feature-frozen, fully-shipped extension. Almost every task MODIFIES an existing file by *extending an established chokepoint*, not by creating new machinery. For each modified file the analog IS the file itself — the excerpts below capture the current chokepoint so the executor extends the real code, not an assumption. New files (docs, packaging script, helpers) map to existing in-repo conventions.

> **Confirmed this session (resolves RESEARCH Open Question 1 / Assumption A2):** `src/background/alarms.ts` sets `periodInMinutes: 1` (alarm fires every 1 minute). This is far below the ~10 min D-01 idle window, so an actively-classifying browser never tears down between ticks. The idle window may stay at ~10 min as planned.

---

## File Classification

| File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|------|---------|------|-----------|----------------|---------------|
| `src/background/classifier.ts` | MODIFY | service (SW lifecycle owner) | request-response + event-driven (idle timer) | itself (lines 92–187) | self |
| `src/offscreen/main.ts` | MODIFY | service (ONNX session singleton) | request-response | itself (lines 9–53, 119–128) | self |
| `src/background/idb.ts` | MODIFY | service (IDB CRUD) | CRUD / file-I/O | itself (`pruneIfNeeded` 98–112, put fns) | self |
| `src/background/index.ts` | MODIFY | controller (SW message+tab listeners) | event-driven | itself (listeners 28–246) | self |
| `src/background/badge.ts` | MODIFY/VERIFY | utility (pure render) | transform | itself (lines 1–7) | self |
| `src/content/form-watcher.ts` | MODIFY | content script | event-driven | itself (top-of-file 1–57) | self |
| `manifest.json` | MODIFY | config | — | itself (permissions 35–43, meta 1–5) | self |
| `src/popup/index.css` | MODIFY | config (styles) | — | itself (`@layer base` 120–130) | self |
| `src/dashboard/index.css` | MODIFY | config (styles) | — | `src/popup/index.css` `@layer base` | exact (sibling) |
| `src/components/ui/*` | VERIFY | component | — | Radix-based (audit for native controls) | n/a |
| `package.json` (scripts) | MODIFY | config | batch | itself (scripts 5–10) | self |
| `vite.config.ts` | reference | config | — | itself (build 31–39) | self |
| `src/shared/restricted-urls.ts` | NEW | utility (predicate) | transform | `hibernation.ts` `isDiscardable` http-guard (line 17) | role+convention |
| `src/shared/mem-probe.ts` (or in offscreen) | NEW | utility (dev probe) | transform | RESEARCH Code Example + `main.ts` `typeof` guard idiom (135) | research-pattern |
| `PERMISSIONS.md` | NEW | doc | — | `manifest.json` permissions + call sites | doc |
| `PRIVACY.md` | NEW | doc | — | `README.md` / `CONTRIBUTING.md` repo-root convention | doc |
| `docs/MEMORY-RUNBOOK.md` | NEW | doc | — | (no analog — new doc) | none |
| `docs/CROSS-OS-SCREENSHOTS.md` | NEW | doc | — | (no analog — new doc) | none |
| packaging script | NEW | config/tooling | batch | `package.json` scripts + `vite.config.ts` | role-match |

---

## Pattern Assignments

### `src/background/classifier.ts` (service, lifecycle chokepoint) — D-01, D-05

**Analog:** itself. This is THE chokepoint. The offscreen lifecycle is already centralized here via `ensureOffscreen()` (lines 102–126) and the `creatingOffscreen` promise guard (line 95). D-01 idle-teardown + D-05 in-flight guard EXTEND this file — do not scatter `closeDocument()` into `hibernation.ts` or `index.ts`.

**Existing creation chokepoint** (lines 92–126) — extend, do not replace:
```typescript
let creatingOffscreen: Promise<void> | null = null

export async function ensureOffscreen(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('src/offscreen/index.html')
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  })
  if (contexts.length > 0) return                 // already alive — reuse
  if (creatingOffscreen) { await creatingOffscreen; return }   // race guard
  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'src/offscreen/index.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run ONNX Runtime Web for local tab vitality classification',
  })
  await creatingOffscreen
  creatingOffscreen = null
}
```
> D-05 note: `ensureOffscreen()` ALREADY recreates after teardown — `getContexts()` returns `[]` after `closeDocument()`, falling through to `createDocument()`. D-05 adds ONLY the `pending` ref-count guard around the classify call; do NOT modify `ensureOffscreen` itself (RESEARCH Code Examples / D-05).

**Existing classify chokepoint** (lines 136–187) — wrap the `sendMessage` with `pending++/finally pending--` and `armIdleTeardown()`:
```typescript
export async function classifyBatch(
  candidateTabs: Array<{ tabId: number; url: string; meta: TabMeta }>
): Promise<void> {
  if (candidateTabs.length === 0) return
  try {
    await ensureOffscreen()                       // <-- recreates on demand (D-05)
    // ...build feature vectors, filter nulls...
    const response = (await chrome.runtime.sendMessage({   // <-- wrap with pending guard
      type: 'CLASSIFY_BATCH', tabs: toClassify,
    })) as { results: Array<{ tabId: number; label: TabVitality | null; confidence: number }> }
    // ...existing cache read/prune/write...
  } catch {
    // Offscreen document may not be ready — silently skip; next alarm tick will retry
  }
}
```
> The whole body is already wrapped in a silent `try/catch` (RESEARCH "thumbnail.ts captureAndStore" idiom) — preserve it. The new idle-teardown constant (~10 min, Claude's discretion) belongs in `src/shared/constants.ts` (see Shared Patterns) alongside `AI_*` constants, not hard-coded here.

**Error-handling pattern (whole file):** silent `try { ... } catch { /* next tick retries */ }` — never throw. Teardown's `sendMessage('RELEASE_SESSION')` and `closeDocument()` must each be individually `try/catch`-swallowed (doc may already be gone).

---

### `src/offscreen/main.ts` (service, ONNX session singleton) — D-01

**Analog:** itself. The `session` singleton + `getSession()` accessor (lines 12–53) is where teardown nulls out, and the top-level `onMessage` listener (lines 119–128) is where a `RELEASE_SESSION` handler is added.

**Singleton + reset idiom** (lines 12–53) — the `sessionInit = null` reset is the exact pattern RELEASE must reuse:
```typescript
let session: ort.InferenceSession | null = null
let sessionInit: Promise<void> | null = null
// ...getSession() sets session, resets sessionInit in finally so retry works...
```

**Existing top-level listener** (lines 119–128) — ADD a sibling `RELEASE_SESSION` branch using the same `.then(sendResponse)` + `return true` shape:
```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CLASSIFY_BATCH') {
    handleClassifyBatch(message.tabs as Array<{ tabId: number; features: number[] }>)
      .then(sendResponse)
      .catch(() => sendResponse({ results: [] }))
    return true   // keep channel open for async response
  }
  // D-01: add RELEASE_SESSION branch here — call session?.release(), null session + sessionInit,
  //       then sendResponse({ ok: true }); return true. (RESEARCH Pattern 2)
})
```
> The `closeDocument()` in `classifier.ts` destroys this whole context regardless — `session.release()` is the documented cleanliness step, NOT the memory lever (RESEARCH Pattern 2 / Anti-Pattern). On RELEASE, null BOTH `session` and `sessionInit` so a recreated document re-inits cleanly. The `numThreads = 1` comment (lines 27–29) documents WHY the extension is not cross-origin isolated — this is why the D-02 probe is usually unavailable (Pitfall 2); do not change it.

---

### `src/background/idb.ts` (service, CRUD) — D-07 quota

**Analog:** itself. Quota handling WRAPS existing write paths; oldest-first eviction REUSES `pruneIfNeeded` (lines 98–112).

**Existing oldest-first eviction** (lines 98–112) — reuse this, don't build new eviction:
```typescript
export async function pruneIfNeeded(): Promise<void> {
  const all = await getAllThumbnails()
  const totalBytes = all.reduce((sum, r) => sum + Math.ceil(r.dataUrl.length * 0.75), 0)
  if (totalBytes <= IDB_SIZE_CAP_BYTES) return
  const sorted = [...all].sort((a, b) => a.capturedAt - b.capturedAt)   // oldest first
  let remaining = totalBytes
  for (const record of sorted) {
    if (remaining <= IDB_SIZE_CAP_BYTES) break
    await deleteThumbnail(record.tabId)
    remaining -= Math.ceil(record.dataUrl.length * 0.75)
  }
}
```

**Write paths to guard** (lines 74–77, 119–122, 171–174, 181–184) — `putThumbnail`, `appendTabHistory`, `putDomainBias`, `putTabState` all follow the same `const db = await getDb(); await db.put(...)` shape. Wrap each (or a shared helper) per RESEARCH Pattern 4: catch `DOMException` with `name === 'QuotaExceededError'`, call eviction, retry once, then give up silently.
```typescript
// RESEARCH Pattern 4 — apply over the existing put/add calls
async function putWithQuotaGuard(write: () => Promise<void>, evict: () => Promise<void>) {
  try { await write() }
  catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'QuotaExceeded')) {
      await evict().catch(() => {})
      try { await write() } catch { /* D-07: no unhandled rejection */ }
    }
  }
}
```
> Phase 3 invariant: ALL IDB writes stay in the Service Worker (this file is SW-only) — do NOT move IDB into offscreen/content. The `idb` singleton `dbPromise` (line 35) + `blocking()` close handler (lines 59–66) are established and must be preserved.

---

### `src/background/index.ts` (controller, event-driven) — D-07 cold-start, D-08 churn/startup

**Analog:** itself. This is an ASSERT-and-EXTEND target, not a rewrite (RESEARCH Pitfall 4/5). The correct patterns already exist; D-07/D-08 add tests + tighten edges.

**Top-level synchronous listener registration** (lines 17–22, 28, 66, 72, 100, 133, 151, 221, 240) — every listener is registered at module top level. PRESERVE this; never register inside async callbacks (no listener leak under churn — D-08).

**Single atomic storage read + `?? default` fallback** (e.g. lines 76–80, 105–106, 134–135, 190–191) — every read uses `(result.x as T) || {}` / `?? {}`. This is the cold-start tolerance pattern (D-07 Pitfall 4) — assert it, don't change it.

**Churn invariants already in place (D-08):**
- `lastActiveTabId` reset on removal (lines 146–148).
- Discard double-count is naturally idempotent: counting only happens on non-`undefined` `discard()` return (see `hibernation.ts` lines 122–123). Badge derives purely from the persisted count.
- `onUpdated` `discarded === false` check ordered BEFORE the `status === 'complete'` early-return (lines 104, 125) — Chrome emits `discarded:false` on `loading` (CR-02). Preserve this ordering.

**Security/validation idiom (preserve when touching handlers):** tabId taken from `sender.tab?.id` ONLY, never message body (lines 155, 174, 188); `KEEP_ALIVE` field validation (lines 209–215); literal `return true` for async `sendResponse` (line 185), bare `return` for fire-and-forget (Chrome 120 / COMP-01).

> D-06 SW side is already satisfied: discard path is http-guarded in `hibernation.ts isDiscardable` (line 17) and thumbnail capture guards `tab.url?.startsWith('http')` (index.ts line 127). D-06's gap is the content-script top-of-file guard + CWS store URL prefixes.

---

### `src/background/badge.ts` (utility, pure transform) — D-08 (verify only)

**Analog:** itself (lines 1–7). `updateBadge(count)` is already a pure function of `count` — no internal state to corrupt. D-08 asserts the badge derives from the persisted `hibernated_count`; no new surface needed.
```typescript
export async function updateBadge(count: number): Promise<void> {
  const text = count <= 0 ? '' : count >= 1000 ? '999+' : String(count)
  await chrome.action.setBadgeText({ text })
  if (count > 0) await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
}
```
> vitest-chrome quirk (STATE invariant): `chrome.action` is manually mocked — badge tests must use the manual mock, not assume a real emitter.

---

### `src/content/form-watcher.ts` (content script, event-driven) — D-06 restricted-page guard

**Analog:** itself (top-of-file, lines 1–57). The guard goes at the VERY TOP, before any DOM listener or `sendMessage`.

**No-import + inlined-constants convention** (lines 1–11) — this file is standalone (globals only). The restricted-URL list MUST be INLINED here (duplicated from the shared helper), matching how `DEBOUNCE_MS`/`MAX_FIELDS` are inlined "(identical values to src/shared/constants.ts)":
```typescript
// Content script: ... No imports — content scripts are standalone globals-only files in this project.
// Constants are inlined (identical values to src/shared/constants.ts).
const DEBOUNCE_MS = 500          // identical to shared/constants.ts
const MAX_FIELDS = 50
```

**Existing best-effort messaging** (lines 44–51) — the new guard sits ABOVE this; if URL is restricted, early-return so `reportFormActivity()` and all listeners never register:
```typescript
function reportFormActivity(): void {
  chrome.runtime.sendMessage({ type: 'FORM_ACTIVITY', timestamp: Date.now() })
    .catch(() => { /* SW may be starting up; message is best-effort */ })
}
```
> D-06 guard shape (RESEARCH Pattern 3) — inline at top of file, mirroring `index.ts`/`hibernation.ts` `startsWith('http')` convention; denylist `chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools://`, `view-source:`, `chrome-untrusted://`, and the two CWS store hosts. Do NOT add an `import` to this file.

---

### `manifest.json` (config) — D-03 remove scripting, D-09 metadata

**Analog:** itself.

**Permissions array** (lines 35–43) — delete `"scripting"` (grep-confirmed zero `chrome.scripting` usages in `src/` this session). Keep the other six:
```json
"permissions": [
  "storage", "tabs", "alarms", "contextMenus", "scripting", "activeTab", "offscreen"
]
```
**Metadata** (lines 1–5) — D-09: verify/polish `name`, `description`, bump `version` (currently `1.0.0`), add `homepage_url`. Icons already declared at 16/32/48/128 (lines 6–13, 44–49) and all four PNGs verified present in `icons/`.
> After editing manifest, `dist/` MUST be rebuilt before zipping (Pitfall 6) — the stale `dist/` still contains `scripting`.

---

### `src/popup/index.css` + `src/dashboard/index.css` (config/styles) — D-13 cross-OS normalization

**Analog:** `src/popup/index.css` `@layer base` block (lines 120–130). The dashboard CSS shares this structure (sibling exact match). Tailwind v4 `@layer base` is the established normalization surface — add scrollbar/font normalization here, NOT a new global stylesheet.

**Existing base layer to extend** (lines 120–130):
```css
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }   /* font-sans = 'Geist Variable', sans-serif (theme line 10) */
}
```
> RESEARCH Pattern 5: add `scrollbar-width: thin` + `::-webkit-scrollbar` rules (Windows fat bars vs macOS overlay are the real per-OS risk) and per-OS font fallbacks after Geist. Radix controls (slider/switch/scroll-area) render consistently — VERIFY no native `<select>`/`<input type=range>` exists in `src/popup` + `src/dashboard` before sizing control-normalization (RESEARCH Open Question 2 / A4).

---

### `package.json` scripts + packaging script (config/tooling) — D-09

**Analog:** `package.json` scripts block (lines 5–10) + `vite.config.ts` build config (lines 31–39).
```json
"scripts": { "dev": "vite", "build": "vite build", "test": "vitest run", "test:e2e": "playwright test" }
```
> D-09: add a `package` script that runs `npm run build` FIRST (so `dist/manifest.json` reflects the removed `scripting` + bumped version — Pitfall 6), THEN zips `dist/` with manifest at the zip root. Use plain `zip` CLI (or node `adm-zip`/`archiver` fallback). Do NOT add `web-ext` (STATE: rejects chrome:// patterns).

---

## New Files → Pattern Sources

### `src/shared/restricted-urls.ts` (NEW utility) — D-06
**Pattern source:** `hibernation.ts isDiscardable` http-guard (line 17: `!tab.url.startsWith('http://') && !tab.url.startsWith('https://')`). Live in `src/shared/` next to `constants.ts`/`types.ts`. Export `isInjectable(url)` (RESEARCH Pattern 3). NOTE: the SW side can `import` this; the content script CANNOT — it inlines the list (see form-watcher above).

### `src/shared/mem-probe.ts` or offscreen-local helper (NEW dev utility) — D-02
**Pattern source:** RESEARCH Code Example `logMemoryProbe` + `main.ts` `typeof document !== 'undefined'` guard idiom (line 135). MUST guard `crossOriginIsolated` + `typeof performance.measureUserAgentSpecificMemory === 'function'` (Pitfall 2 — extension is not COI). Gate behind `import.meta.env.DEV` (RESEARCH Open Question 3) so production carries zero probe code (NFR-04 cleanliness). Never throws — `console.debug` only.

### `PERMISSIONS.md` (NEW doc) — D-04/D-10
**Pattern source:** `manifest.json` permissions + verified call sites. One line per kept permission: `storage`→`chrome.storage.local`; `tabs`→`chrome.tabs.query/discard/get`; `alarms`→hibernation tick (`alarms.ts`); `contextMenus`→`contextMenus.ts` + `index.ts` line 221; `activeTab`→`chrome.tabs.captureVisibleTab` (`thumbnail.ts`); `offscreen`→ONNX in `offscreen/main.ts`.

### `PRIVACY.md` (NEW doc) — D-10
**Pattern source:** repo-root markdown convention (`README.md`, `CONTRIBUTING.md`). Zero-telemetry statement (NFR-04) — verified no external `fetch` in `src/` this session; all I/O is `chrome.storage`/IDB/local model.

### `docs/MEMORY-RUNBOOK.md` + `docs/CROSS-OS-SCREENSHOTS.md` (NEW docs) — D-02/D-13
**No analog** (`docs/` does not yet exist). Plain markdown checklists. MEMORY-RUNBOOK = Chrome Task Manager (Shift+Esc) procedure, the NFR-01 gate of record. CROSS-OS-SCREENSHOTS = manual per-OS (Win/macOS/Linux) checklist — maintainer task, not CI.

---

## Shared Patterns

### Silent-catch error handling
**Source:** `classifier.ts classifyBatch` (lines 184–186), `index.ts` (`.catch(() => {})` throughout), `thumbnail.ts` captureAndStore idiom.
**Apply to:** ALL new async paths (D-01 teardown, D-07 quota, D-06 guard). No async rejection may escape (V7 / D-07).
```typescript
try { await thing() } catch { /* swallow — next tick / best-effort */ }
```

### Top-level synchronous listener registration
**Source:** `index.ts` lines 17–22, 28, 66, 72, 100, 133, 151, 221, 240; `offscreen/main.ts` line 119.
**Apply to:** any new listener (e.g. offscreen `RELEASE_SESSION` branch — add to the EXISTING listener, do not register a second one).

### Chrome 120 messaging convention (COMP-01)
**Source:** `index.ts` line 185 (`return true` for async `sendResponse`), `offscreen/main.ts` line 126.
**Apply to:** the new `RELEASE_SESSION` handler — `.then(sendResponse)` + literal `return true`.

### Module-level singleton with reset
**Source:** `offscreen/main.ts` `session`/`sessionInit` (lines 12–53), `idb.ts dbPromise` (line 35), `classifier.ts creatingOffscreen` (line 95).
**Apply to:** D-01 `pending` ref-count + `idleTimer` in `classifier.ts`; null-out `session`+`sessionInit` on RELEASE.

### Constants in `src/shared/constants.ts`
**Source:** `constants.ts` (`AI_*`, `DEBOUNCE_MS`, etc.).
**Apply to:** new `OFFSCREEN_IDLE_MS` (~10 min, D-01) — add alongside `AI_*` constants. Inline a copy into `form-watcher.ts` only if the content script needs it (it does not for D-01).

### Test conventions (Validation Architecture)
**Source:** `classifier.test.ts` (lines 274–319 — `vi.mocked(chrome.runtime.getContexts).mockResolvedValue`, fake timers), `idb.test.ts` (fake-indexeddb), `index.test.ts` (`callListeners()`).
**Apply to:** EXTEND `classifier.test.ts` (D-01/D-05 — assert no `closeDocument()` while `pending>0`, recreate after close), `idb.test.ts` (D-07 quota), `index.test.ts` (D-08 churn via `callListeners()`); NEW `restricted-urls.test.ts` (D-06 truth table); manifest-assertion test (D-03).
> vitest-chrome quirks (STATE): `chrome.action` manually mocked; `onMessage`/`onChanged` `addListener` are real emitters — use `callListeners()`, never `.mockReturnValue`.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `docs/MEMORY-RUNBOOK.md` | doc | First file in `docs/`; no prior runbook. Use plain markdown + Task Manager procedure (D-02). |
| `docs/CROSS-OS-SCREENSHOTS.md` | doc | First per-OS screenshot checklist; manual maintainer gate, no in-repo precedent. |
| packaging/zip script | tooling | No existing build-artifact tooling. Compose from `npm run build` + `zip`; no analog script to copy. |

---

## Metadata

**Analog search scope:** `src/background/`, `src/offscreen/`, `src/content/`, `src/popup/`, `src/dashboard/`, `src/components/ui/`, `src/shared/`, repo root (`manifest.json`, `package.json`, `vite.config.ts`).
**Files scanned:** 16 read in full or in relevant range; alarm interval + discard guard + classifier test mocks verified by targeted read.
**Key verifications this session:** `periodInMinutes: 1` (alarms.ts) confirms ~10 min idle window is safe; zero `chrome.scripting` usages confirms clean D-03 removal; `isDiscardable` http-guard (hibernation.ts:17) confirms D-06 SW side already satisfied; all four icon PNGs present.
**Pattern extraction date:** 2026-06-20
