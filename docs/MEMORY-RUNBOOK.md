# Memory Runbook — NFR-01 Gate of Record

**Purpose:** Reproducible procedure for measuring Smart Hibernator's RAM footprint using Chrome Task Manager, before and after the idle-teardown window. This is the **official NFR-01 pass/fail gate**. The programmatic dev probe (`logMemoryProbe`) is supplementary visibility only — see note at the bottom.

**Pass threshold:** Total extension RSS (SW + Offscreen Document + any open pages) **< 45 MB** after the idle window under many-tabs load.

---

## When to run this

- Before any CWS submission (required gate).
- After any change touching `src/background/classifier.ts`, `src/offscreen/main.ts`, or `src/shared/constants.ts` (the offscreen-lifecycle chokepoint).
- After an `onnxruntime-web` version bump.

---

## Prerequisites

- **Chrome 120+** (or Edge Chromium)
- **Clean build** — run `npm run build` first (or `npm run package` which includes a build step). Do not load a stale `dist/` from a prior session.
- The extension loaded **unpacked** from the `dist/` folder (developer mode) or from a freshly produced zip loaded unpacked.
- **Past AI cold start.** The AI only classifies once `AI_COLD_START_MIN_SAMPLES` (50) tab-history rows exist. On a fresh profile no classification runs and, since the G-05-1 fix, **no offscreen document is ever created**, so the "warm" reading would be meaningless (there is nothing to tear down). Either use a profile with real browsing already recorded by the extension, or seed at least 50 rows from the service-worker DevTools console (`chrome://extensions` → Smart Hibernator → Inspect views → service worker → Console):

  ```js
  // Seed 60 tab-history rows across ~10 domains, one hour apart (modeled on uat-evidence/nfr01-run.mjs)
  const db = await new Promise((res, rej) => { const r = indexedDB.open('smart-hibernator'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const doms = ['github.com','wikipedia.org','python.org','nodejs.org','bbc.com','example.com','npmjs.com','gnu.org','kernel.org','archive.org']
  const tx = db.transaction('tab-history', 'readwrite'); const st = tx.objectStore('tab-history'); const now = Date.now()
  for (let i = 0; i < 60; i++) { const d = doms[i % doms.length]; st.add({ domain: d, url: 'https://' + d + '/', visitStart: now - i * 3600e3, visitEnd: now - i * 3600e3 + 120e3, dwellMs: 120e3, hadFormActivity: false, timestamp: now - i * 3600e3 }) }
  await new Promise(r => tx.oncomplete = r); db.close()
  ```

---

## Step-by-step procedure

### Step 1 — Load the build

1. Run `npm run build` from the repo root to produce a fresh `dist/`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Confirm the Smart Hibernator extension card appears with version `1.0.1` and no errors.

### Step 2 — Open a many-tabs load

1. Open **50 real tabs** across multiple distinct domains (not duplicates of the same page — the AI uses domain signals, so variety matters).
   - Suggested mix: news sites, GitHub repos, documentation pages, social media, YouTube, search results.
   - 50 tabs is the minimum for a meaningful warm-path reading. 80–100 tabs better represent the target user.
2. Wait for all tabs to finish loading (no loading spinners).
3. Let the extension classify — the alarm fires every **1 minute**, so allow at least 2–3 minutes for the first classification burst to complete. The first burst happens on the first alarm tick after the cold-start threshold is met. Later ticks do **not** re-classify unless something changes: a tab activation, form input, a Keep Alive or wake-signal bias change, a hostname change, or the 60-minute `AI_CLASSIFICATION_TTL_MS` refresh.

### Step 3 — Take the "warm" reading

1. Open Chrome Task Manager: **Shift+Esc** (or Chrome menu → More tools → Task Manager).
2. Find and record the **Memory footprint** (RSS) of each Smart Hibernator process:
   - `Extension: Smart Hibernator` — the Service Worker.
   - `Extension: Smart Hibernator (offscreen)` — the Offscreen Document (holds the ONNX model and WASM heap).
   - Any `Extension page: Smart Hibernator` entries if the popup or dashboard is open — close them before the reading if you want SW-only numbers.
3. Sum the values. Record as **"warm" total RSS**.

   Example table to fill in:

   | Process | Warm RSS |
   |---------|----------|
   | Service Worker | ______ MB |
   | Offscreen Document | ______ MB |
   | **Total** | ______ MB |

4. Also note whether the offscreen document is **present** at this point (it should be, since classification has been running).

### Step 4 — Wait for the idle window

1. Stop all activity: do not switch tabs, do not open new URLs, do not interact with the extension. A single tab switch counts as activity: the previously active tab becomes a stale candidate, triggers a new classification burst on the next tick, and restarts the 10-minute window.
2. The `OFFSCREEN_IDLE_MS` constant is **10 minutes** (`src/shared/constants.ts`). Teardown is a one-shot `chrome.alarms` alarm named `OFFSCREEN_IDLE_TEARDOWN`. It is re-scheduled to now + 10 min at the end of every classification burst and when the document is created, and it survives service-worker suspension. When it fires, `teardownIfIdle()` closes the document (unless a burst is in flight).
3. Wait **at least 12 minutes** from your last browser interaction (2 minutes of buffer above the 10-minute idle window) to ensure the alarm has fired.
4. Tip: in the service-worker console, `await chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN')` shows `scheduledTime`, which should stop moving once the browser is idle.
5. Optional: watch `chrome://extensions` → Smart Hibernator → "Inspect views" — the offscreen view should disappear from the list when the document is torn down.

### Step 5 — Take the "idle" reading (the gate)

1. Re-open Chrome Task Manager (Shift+Esc).
2. Confirm the **Offscreen Document process is absent** from the Task Manager list. This is the primary observable signal that the idle teardown fired.
3. Record the Service Worker RSS:

   | Process | Idle RSS |
   |---------|----------|
   | Service Worker | ______ MB |
   | Offscreen Document | _gone_ (expected) |
   | **Total** | ______ MB |

4. **Pass/fail evaluation:**
   - **PASS:** Total extension RSS < **45 MB** with the offscreen document absent. ✓
   - **FAIL:** Total extension RSS ≥ 45 MB, or the offscreen document is still present after the idle window.

### Step 6 — Verify cold-start recreation (optional but recommended)

1. After the idle reading, switch to a **different** tab. The recreation trigger is that tab activation: the previously active tab becomes stale and the next alarm tick runs a classification burst.
2. Wait up to one alarm period (1 minute), then re-open Task Manager.
3. Confirm the **Offscreen Document process reappears** — the idle-teardown recreation path is working (`ensureOffscreen()` in `classifier.ts` transparently recreates the document on the next `classifyBatch()` call).
4. Expected long-idle pattern: with no activity at all, the document is recreated about once per `AI_CLASSIFICATION_TTL_MS` (60 min) for a refresh burst and torn down 10 minutes later.
5. Confirm there are **no console errors** in the Service Worker (`chrome://extensions` → Smart Hibernator → Inspect views → service worker):
   - Look for: `Error creating offscreen document`, `sendMessage port closed`, or `session init failed`.
   - None of these should appear.

---

## Recording results

Fill in this template when the gate passes and include it in the release notes / PR description:

```
NFR-01 Gate of Record — Smart Hibernator vX.Y.Z
Date: ___________
Chrome version: ___________
OS: ___________
Tab count: ___________

Warm reading (offscreen alive, active classification):
  Service Worker RSS:    ___ MB
  Offscreen Document RSS: ___ MB
  Total:                 ___ MB

Idle reading (after ~10 min idle, offscreen torn down):
  Service Worker RSS:    ___ MB
  Offscreen Document:    ABSENT ✓ / PRESENT ✗
  Total:                 ___ MB

Result: PASS (< 45 MB) ✓ / FAIL (≥ 45 MB) ✗

Recreation observed: YES ✓ / NO ✗
Console errors on recreation: NONE ✓ / PRESENT ✗ (describe: ___)
```

---

## Failure triage

| Symptom | Likely cause | Where to look |
|---------|-------------|---------------|
| Offscreen document still present after 12+ min idle | Teardown alarm not scheduled or not firing, or `pending` ref-count stuck > 0 | `await chrome.alarms.get('OFFSCREEN_IDLE_TEARDOWN')` in the SW console; `armIdleTeardown()` / `teardownIfIdle()` in `classifier.ts`; the `OFFSCREEN_IDLE_TEARDOWN` branch in `index.ts` |
| Total RSS ≥ 45 MB even with offscreen absent | SW holding large data structures | `idb.ts` thumbnail store size; `chrome.storage.local` cache size |
| Offscreen document present and RSS ≥ 45 MB | Teardown not working at all | `armIdleTeardown()` in `classifier.ts`; confirm `OFFSCREEN_IDLE_MS` constant |
| Recreation fails (console errors) | `ensureOffscreen()` or `getContexts()` error | `classifier.ts` `ensureOffscreen()` try/catch; Chrome 120 offscreen API compat |
| Document reappears every minute | Something marks classifications stale every tick, or something creates the document at SW boot | Inspect `isClassificationStale` inputs (`tab_meta` `lastActiveAt` churn, `featureKey`) in `classifier.ts`; `index.ts` must not call `ensureOffscreen()` at boot |
| Offscreen document disappears mid-classification | `pending` guard not spanning `ensureOffscreen()` plus the `CLASSIFY_BATCH` round-trip | `pending++` / `finally { pending-- }` in `classifyBatch` (`classifier.ts`) |

---

## Note on the programmatic probe

The extension ships a DEV-only memory probe (`logMemoryProbe` in `src/shared/mem-probe.ts`). In production builds this probe is compiled out entirely (gated by `import.meta.env.DEV`). In development builds:

- The probe calls `performance.measureUserAgentSpecificMemory()`.
- **This API requires cross-origin isolation** (`COOP+COEP` headers). The extension intentionally runs without cross-origin isolation (ONNX Runtime Web is configured `numThreads=1` to avoid the SharedArrayBuffer requirement) — so the probe is **usually unavailable** and will log `probe unavailable (crossOriginIsolated=false)` to `console.debug`.
- **Do not** add `Cross-Origin-Embedder-Policy` or `Cross-Origin-Opener-Policy` headers to enable the probe — this would change the WASM threading configuration, which is a behavior change out of scope for Phase 5.
- **The Chrome Task Manager reading (this runbook) is the authoritative gate**, not the probe.

The probe is supplementary visibility only: if it does happen to be available in your environment, it is a useful regression signal, but a "probe unavailable" result is expected and does not indicate a bug.

---

*Runbook version: 1.1 — reflects Smart Hibernator v1.0.1 with the G-05-1 fix (OFFSCREEN_IDLE_MS = 10 min via the `OFFSCREEN_IDLE_TEARDOWN` alarm, AI_CLASSIFICATION_TTL_MS = 60 min, alarm period = 1 min, NFR-01 threshold = 45 MB).*
