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
3. Let the extension classify — the alarm fires every **1 minute**, so allow at least 2–3 minutes for the first classification burst to complete.

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

1. Stop all activity: do not switch tabs, do not open new URLs, do not interact with the extension.
2. The `OFFSCREEN_IDLE_MS` constant is **10 minutes** (`src/shared/constants.ts`). After the last classification burst, the idle timer arms; it fires and tears down the offscreen document **10 minutes later** (if no new classification burst fires first).
3. Wait **at least 12 minutes** from your last browser interaction (2 minutes of buffer above the 10-minute idle window) to ensure the timer has fired.
4. Optional: watch `chrome://extensions` → Smart Hibernator → "Inspect views" — the offscreen view should disappear from the list when the document is torn down.

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

1. After the idle reading, switch to one of the open tabs to trigger the next alarm tick (or wait up to 1 minute for the next alarm).
2. Within 1 alarm period (1 minute), re-open Task Manager.
3. Confirm the **Offscreen Document process reappears** — the idle-teardown recreation path is working (`ensureOffscreen()` in `classifier.ts` transparently recreates the document on the next `classifyBatch()` call).
4. Confirm there are **no console errors** in the Service Worker (`chrome://extensions` → Smart Hibernator → Inspect views → service worker):
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
| Offscreen document still present after 12+ min idle | Idle timer not firing, or `pending` ref-count stuck > 0 | `teardownIfIdle()` in `classifier.ts`; check `pending` counter |
| Total RSS ≥ 45 MB even with offscreen absent | SW holding large data structures | `idb.ts` thumbnail store size; `chrome.storage.local` cache size |
| Offscreen document present and RSS ≥ 45 MB | Teardown not working at all | `armIdleTeardown()` in `classifier.ts`; confirm `OFFSCREEN_IDLE_MS` constant |
| Recreation fails (console errors) | `ensureOffscreen()` or `getContexts()` error | `classifier.ts` `ensureOffscreen()` try/catch; Chrome 120 offscreen API compat |
| Offscreen document disappears but reappears immediately | `pending` guard not holding teardown long enough, or alarm firing before idle window elapses | Confirm `OFFSCREEN_IDLE_MS` (10 min) > alarm period (1 min) |

---

## Note on the programmatic probe

The extension ships a DEV-only memory probe (`logMemoryProbe` in `src/shared/mem-probe.ts`). In production builds this probe is compiled out entirely (gated by `import.meta.env.DEV`). In development builds:

- The probe calls `performance.measureUserAgentSpecificMemory()`.
- **This API requires cross-origin isolation** (`COOP+COEP` headers). The extension intentionally runs without cross-origin isolation (ONNX Runtime Web is configured `numThreads=1` to avoid the SharedArrayBuffer requirement) — so the probe is **usually unavailable** and will log `probe unavailable (crossOriginIsolated=false)` to `console.debug`.
- **Do not** add `Cross-Origin-Embedder-Policy` or `Cross-Origin-Opener-Policy` headers to enable the probe — this would change the WASM threading configuration, which is a behavior change out of scope for Phase 5.
- **The Chrome Task Manager reading (this runbook) is the authoritative gate**, not the probe.

The probe is supplementary visibility only: if it does happen to be available in your environment, it is a useful regression signal, but a "probe unavailable" result is expected and does not indicate a bug.

---

*Runbook version: 1.0 — reflects Smart Hibernator v1.0.1 (OFFSCREEN_IDLE_MS = 10 min, alarm period = 1 min, NFR-01 threshold = 45 MB).*
