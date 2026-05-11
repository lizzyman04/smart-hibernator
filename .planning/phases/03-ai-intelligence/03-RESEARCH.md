# Phase 3: AI Intelligence - Research

**Researched:** 2026-05-11
**Domain:** ONNX Runtime Web / Chrome MV3 Offscreen Documents / IndexedDB Behavioral History / Local ML Inference
**Confidence:** HIGH (core ORT-Web APIs verified via official docs and CDN; Offscreen Document API verified via Chrome official docs; WASM/CSP constraints verified via GitHub issues and Chrome developer docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Primary signal is a combined score — weighted blend of revisit frequency, dwell time, and form activity (`lastFormActivity` from `tab_meta`). No single signal dominates.
- **D-02:** Domain heuristics are included as a signal — preset category boosts for vital domains (docs.*, github.com, productivity tools) or dead domains (news/media after read). Existing domain whitelist in Settings can surface as a strong-Vital override.
- **D-03:** Behavioral history stored in **IndexedDB** (existing `idb.ts` infra). Per-domain and per-tab history rows covering a **14-day rolling window**. `chrome.storage.local` NOT used for this — 10 MB quota insufficient for power users.
- **D-04:** Vital classification → tab is **never auto-hibernated** (treated like pinned tab; `isDiscardable()` returns false).
- **D-05:** Semi-Active classification → hibernation delay = **1.5× `timeout_minutes`**.
- **D-06:** Dead classification → hibernation delay = **0.5× `timeout_minutes`**.
- **D-07:** When classifier confidence falls below threshold, **fall back to base `timeout_minutes`** exactly (no degraded partial classification).
- **D-08:** Multipliers (1.5× and 0.5×) are **hardcoded in Phase 3** — no sliders or user-adjustable values.
- **D-09:** Learning triggers are both implicit (wake within short window = misclassification signal) and explicit ("Keep Alive" button = strong Vital signal for domain).
- **D-10:** Adaptation is **per-domain threshold adjustment** — ONNX model weights remain static (bundled); only domain-level classification bias values in IndexedDB are updated.
- **D-11:** Cold start: if behavioral history is insufficient, **AI classification is skipped entirely** and flat base `timeout_minutes` is used.
- **D-12:** Popup tab list rows show a **small colored pill badge** for each tab's classification: `V` (green) for Vital, `S` (amber) for Semi-Active, `D` (gray) for Dead.
- **D-13:** Dashboard **Stats tab gets an AI summary section** below existing Recharts charts: classification breakdown + learning status.
- **D-14:** "Keep Alive" button doubles as AI override — no separate Force Vital / Force Dead control.

### Claude's Discretion
- ONNX model architecture and initial training data source (synthetic rule-based model vs. pre-trained; Claude picks approach fitting MV3 bundle size constraints)
- Feature vector format and normalization strategy
- Offscreen Document ↔ Service Worker message protocol (request/response shape, batching)
- WebGPU vs. WASM fallback detection and switching logic (NFR-03 mandates WebGPU/SIMD)
- Specific confidence threshold value for fallback (~0.6 suggested)
- Cold start minimum sample count before AI activates
- IndexedDB schema for behavioral history (exact store name, index structure)
- Wake event "short window" duration for misclassification signal

### Deferred Ideas (OUT OF SCOPE)
- Model weight retraining in-browser
- User-adjustable Semi-Active / Dead multipliers
- Explicit Force Vital / Force Dead per-domain overrides
- Per-tab RAM measurement
- Tab Group protection
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-05 | Tab Vitality Classification via ONNX Runtime Web in Offscreen Document | Offscreen Document lifecycle pattern, ORT-Web session create/run, feature vector design |
| FR-06 | Learning Mode: 14 days refining local classification thresholds | IndexedDB rolling window schema, per-domain bias adjustment pattern, cold start detection |
| FR-07 | Dynamic Timeouts: adjust hibernation delay based on domain patterns and AI confidence | `isDiscardable()` integration, multiplier application, confidence threshold fallback |
| NFR-02 | Inference Latency ≤ 150ms per classification | WASM SIMD batching, session reuse (init once, run many), small model architecture |
| NFR-03 | WebGPU/SIMD acceleration via ORT-Web | Backend detection pattern, `executionProviders` fallback array, SIMD WASM confirmation |
| NFR-04 | Zero Telemetry — no data leaves device | All inference local, IndexedDB only, no fetch calls from Offscreen Document |
</phase_requirements>

---

## Summary

Phase 3 wires ONNX Runtime Web (ORT-Web) into the existing alarm-tick hibernation loop. The key architectural insight is that ORT-Web **cannot run in the MV3 Service Worker** (SW) because SW global scope prohibits dynamic `import()` and lacks WebGPU access. The solution is a **Chrome Offscreen Document** — a hidden HTML page that stays alive across SW restarts, loads ORT-Web via a static `<script>` tag, and communicates with the SW via `chrome.runtime.sendMessage`. The SW calls `ensureOffscreen()` before any alarm tick, sends a classification request with a feature vector, and receives `{ label, confidence }` back.

The classifier itself is a **small synthetic ONNX model** (a scikit-learn Decision Tree / Logistic Regression exported via `skl2onnx`). The input is a 6-element float32 vector: normalized revisit frequency, dwell time, form activity flag, domain category boost, per-domain threshold offset, and recency. A synthetic training dataset is generated from rules (high revisit + long dwell = Vital, etc.) and exported offline as a `.onnx` file bundled with the extension. This avoids large pretrained model downloads and keeps the ONNX file under 50 KB.

The WASM runtime files (~12 MB for `ort-wasm-simd-threaded.wasm`) are copied into the extension build via `vite-plugin-static-copy`, listed in `web_accessible_resources`, and pointed to via `ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')`. The manifest CSP must add `'wasm-unsafe-eval'` to `extension_pages`. Multi-threading requires `cross_origin_embedder_policy` and `cross_origin_opener_policy` headers — simpler to force `numThreads=1` (recommended workaround for extensions). With SIMD WASM and a tiny model, 150ms inference is easily achievable even single-threaded.

**Primary recommendation:** Use `ort.wasm.min.js` + `ort-wasm-simd-threaded.wasm` (WASM-only bundle) loaded from the Offscreen Document. Probe `navigator.gpu` at startup; if WebGPU is available, use `executionProviders: ['webgpu', 'wasm']` — ORT-Web falls back automatically. The ONNX model is a bundled 20-50 KB synthetic Decision Tree.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ML inference (ORT-Web session) | Offscreen Document | — | SW cannot use WebGPU or dynamic import(); Offscreen Document is the only MV3 context with DOM + GPU access |
| Behavioral event collection | Service Worker | Content Script | SW owns `tabs.onActivated`, `tabs.onUpdated`; content script provides form activity already |
| Feature vector assembly | Service Worker | — | SW reads IndexedDB behavioral history and assembles vector before sending to Offscreen Document |
| IndexedDB behavioral history | Service Worker | — | SW writes on every tab activation/dwell event; Offscreen Document reads on classification request |
| Classification result caching | Service Worker (chrome.storage.local) | — | SW caches `{ label, confidence, cachedAt }` per tabId in storage for popup to read |
| Dynamic timeout application | Service Worker (hibernation.ts) | — | `isDiscardable()` and `handleAlarmTick()` already own timeout logic; extend there |
| V/S/D pill badge display | Popup (React) | — | Popup reads classification cache from storage on mount |
| AI summary section | Dashboard (React) | — | Dashboard Stats tab reads classification cache on mount |
| "Keep Alive" button signal | Popup (React) → SW | — | Popup sends `KEEP_ALIVE` message; SW writes domain bias to IndexedDB |
| Per-domain threshold learning | Service Worker | — | SW updates domain bias in IndexedDB on wake events and Keep Alive messages |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| onnxruntime-web | 1.26.0 | ML inference engine | Official Microsoft ONNX runtime; WebGPU + WASM backends; already in project stack decision |
| idb | 8.0.3 | IndexedDB wrapper | Already used in `src/background/idb.ts` for thumbnails; same singleton pattern |
| vite-plugin-static-copy | 4.1.0 | Copy WASM files to build output | Cleanest way to copy WASM files from `node_modules/onnxruntime-web/dist/` into extension build |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| skl2onnx (offline, Python) | latest | Export sklearn model to .onnx | Wave 0 one-time step: generate classifier.onnx from synthetic dataset |
| scikit-learn (offline, Python) | latest | Train Decision Tree / Logistic Regression | Wave 0 one-time step; not bundled in extension |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bundled synthetic ONNX model | Pretrained NLP embedding model | Pretrained models are 25-500MB — far too large to bundle in an extension; synthetic rule-based model is 20-50KB |
| ORT-Web WASM bundle | TensorFlow.js | ORT-Web has better WebGPU support, smaller WASM footprint for inference-only use, and is already the locked stack decision |
| vite-plugin-static-copy | Custom Vite plugin | vite-plugin-static-copy is well-maintained, has 4.1.0 stable, and requires zero boilerplate |

**Installation:**
```bash
npm install onnxruntime-web
npm install -D vite-plugin-static-copy
```

**Version verification:** [VERIFIED: npm registry 2026-05-11]
- `onnxruntime-web@1.26.0` — published 2026-05-08 (latest stable)
- `vite-plugin-static-copy@4.1.0` — verified via npm registry

---

## Architecture Patterns

### System Architecture Diagram

```
User Action / Alarm Tick
         |
         v
[Service Worker — index.ts]
    |           |
    |     chrome.tabs.onActivated / onUpdated
    |           |
    |     Write behavioral event to IndexedDB (tab-history store)
    |
    v
[handleAlarmTick — hibernation.ts]
    |
    1. ensureOffscreen() — create if not exists
    |
    2. Read IndexedDB behavioral history for each candidate tab
    |
    3. Build feature vector for each tab
    |
    4. chrome.runtime.sendMessage({ type: 'CLASSIFY_BATCH', tabs: [...] })
    |              |
    |              v
    |     [Offscreen Document — offscreen.html + offscreen.ts]
    |         |
    |         ORT InferenceSession.run(featureVector)
    |         |
    |         Returns { results: [{ tabId, label, confidence }] }
    |
    5. Write classification results to chrome.storage.local
    |
    6. Apply timeout multiplier:
       Vital → skip (isDiscardable = false)
       Semi-Active → timeoutMs * 1.5
       Dead → timeoutMs * 0.5
       Low confidence / cold start → base timeoutMs
    |
    v
[Popup — App.tsx]
    Reads classification from chrome.storage.local
    Renders V/S/D pill badge + Keep Alive button per tab row

[Dashboard — App.tsx]
    Reads classification counts from chrome.storage.local
    Renders AI summary section below Recharts chart
```

### Recommended Project Structure
```
src/
├── background/
│   ├── index.ts           # Add: ensureOffscreen(), behavioral event hooks, KEEP_ALIVE handler
│   ├── hibernation.ts     # Modify: read classification before isDiscardable(); apply multipliers
│   ├── idb.ts             # Modify: add tab-history object store (new DB version)
│   ├── classifier.ts      # NEW: feature vector assembly, classification request, result caching
│   └── ai-learning.ts     # NEW: per-domain threshold read/write, wake signal recording
├── offscreen/
│   ├── index.html         # NEW: offscreen document HTML entry (CRXJS rollupOptions.input)
│   ├── main.ts            # NEW: ORT session init, CLASSIFY_BATCH message handler
│   └── model-loader.ts    # NEW: load classifier.onnx, configure wasmPaths, backend detection
├── popup/
│   └── App.tsx            # Modify: add V/S/D pill badge + Keep Alive button per row
├── dashboard/
│   └── App.tsx            # Modify: add AI summary section to Stats tab
├── shared/
│   ├── types.ts           # Extend: TabVitality, ClassificationResult, DomainBias, TabHistoryRecord
│   └── constants.ts       # Add: AI_CONFIDENCE_THRESHOLD, AI_COLD_START_MIN_SAMPLES, etc.
└── assets/
    └── classifier.onnx    # NEW: bundled synthetic ONNX model (generated offline in Wave 0)
```

### Pattern 1: Offscreen Document Lifecycle Management
**What:** Create-once pattern using `chrome.runtime.getContexts()` to avoid duplicate creation
**When to use:** Before every alarm tick (must handle SW restart scenario)

```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/offscreen
// Source: https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2

let creatingOffscreen: Promise<void> | null = null

export async function ensureOffscreen(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('src/offscreen/index.html')

  // Chrome 116+: use getContexts() to check for existing document
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  })
  if (contexts.length > 0) return

  // Guard against concurrent creation (SW event parallelism)
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Run ONNX Runtime Web for local tab vitality classification',
    })
    await creatingOffscreen
    creatingOffscreen = null
  } else {
    await creatingOffscreen
  }
}
```

### Pattern 2: ORT-Web Session Init in Offscreen Document
**What:** Initialize InferenceSession once on offscreen document load; reuse for all inference calls
**When to use:** On offscreen document startup (DOMContentLoaded)

```typescript
// Source: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
// Source: https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9

import * as ort from 'onnxruntime-web'

// Configure WASM paths BEFORE session creation
ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')
// Disable multi-threading — requires SharedArrayBuffer/cross-origin isolation
// which complicates extension setup; single thread is fast enough for small model
ort.env.wasm.numThreads = 1

let session: ort.InferenceSession | null = null

async function initSession(): Promise<void> {
  const modelUrl = chrome.runtime.getURL('assets/classifier.onnx')
  const modelBuffer = await fetch(modelUrl).then(r => r.arrayBuffer())

  // WebGPU primary, WASM fallback per NFR-03
  const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu
  const eps = webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm']

  session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: eps,
  })
}
```

### Pattern 3: Feature Vector Construction
**What:** Assemble a normalized float32 6-element vector from behavioral history
**When to use:** In `classifier.ts` before sending to Offscreen Document

```typescript
// [ASSUMED] — feature vector design; specific normalization values are Claude's discretion

export interface TabFeatures {
  revisitFreq: number      // visits in last 14 days, normalized 0-1 (max=30)
  dwellTime: number        // avg seconds per visit, normalized 0-1 (max=3600)
  formActivity: number     // 0 or 1 (had form input in last session)
  domainCategoryBoost: number  // -1 (dead), 0 (neutral), +1 (vital) domain preset
  domainBiasOffset: number    // per-domain learned offset from IndexedDB, -1 to +1
  recency: number          // hours since last visit, normalized 0-1 (max=336 = 14 days)
}

export function buildFeatureVector(features: TabFeatures): ort.Tensor {
  const data = new Float32Array([
    features.revisitFreq,
    features.dwellTime,
    features.formActivity,
    features.domainCategoryBoost,
    features.domainBiasOffset,
    features.recency,
  ])
  return new ort.Tensor('float32', data, [1, 6])  // batch size 1
}
```

### Pattern 4: IndexedDB Behavioral History Schema
**What:** Extend existing `smart-hibernator` IndexedDB to version 2 with a `tab-history` store
**When to use:** In `idb.ts` upgrade callback

```typescript
// [ASSUMED] — exact schema is Claude's discretion per D-03

export interface TabHistoryRecord {
  id?: number          // auto-increment key
  domain: string       // e.g. "github.com"
  url: string          // full URL for URL-level specificity
  visitStart: number   // unix ms — when tab was activated
  visitEnd: number     // unix ms — when tab was deactivated or discarded
  dwellMs: number      // visitEnd - visitStart
  hadFormActivity: boolean
  timestamp: number    // same as visitStart; for rolling window queries
}

export interface DomainBiasRecord {
  domain: string       // keyPath (primary key)
  biasOffset: number   // -1.0 to +1.0; updated by learning mechanism
  keepAliveCount: number
  misclassificationCount: number
  updatedAt: number
}

// DB upgrade: openDB('smart-hibernator', 2, { upgrade(db, oldVersion) {
//   if (oldVersion < 2) {
//     const store = db.createObjectStore('tab-history', { keyPath: 'id', autoIncrement: true })
//     store.createIndex('by-domain', 'domain')
//     store.createIndex('by-timestamp', 'timestamp')
//     db.createObjectStore('domain-bias', { keyPath: 'domain' })
//   }
// }})
```

### Pattern 5: CRXJS Offscreen HTML Entry Point
**What:** Register the offscreen document HTML as a CRXJS rollupOptions.input entry
**When to use:** In `vite.config.ts` and `manifest.json`

```typescript
// vite.config.ts addition:
// rollupOptions: {
//   input: {
//     dashboard: resolve(__dirname, 'src/dashboard/index.html'),
//     offscreen: resolve(__dirname, 'src/offscreen/index.html'),  // NEW
//   },
// },

// manifest.json additions:
// {
//   "permissions": [..., "offscreen"],           // NEW
//   "web_accessible_resources": [
//     { "resources": ["src/dashboard/index.html"], "matches": ["<all_urls>"] },
//     { "resources": ["src/offscreen/index.html"], "matches": ["<all_urls>"] },  // NEW
//     { "resources": ["ort/*.wasm", "ort/*.mjs"], "matches": ["<all_urls>"] },   // NEW
//     { "resources": ["assets/classifier.onnx"], "matches": ["<all_urls>"] }    // NEW
//   ],
//   "content_security_policy": {
//     "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline'"
//   }
// }
```

### Anti-Patterns to Avoid
- **Loading ORT-Web in the Service Worker:** `import()` is disallowed in SW scope by HTML spec; WebGPU is also unavailable in SW. Always run inference in the Offscreen Document. [VERIFIED: GitHub issue microsoft/onnxruntime#20876]
- **Multi-threading without cross-origin isolation:** WASM threads require `SharedArrayBuffer` which requires `cross_origin_embedder_policy: require-corp`. Instead, set `numThreads=1` — plenty fast for a 6-feature model. [VERIFIED: Chrome developer docs]
- **Fetching WASM from CDN at runtime:** Violates extension CSP (`script-src 'self'`). Bundle WASM files locally via `vite-plugin-static-copy` and use `chrome.runtime.getURL()`. [VERIFIED: multiple community sources]
- **Re-creating InferenceSession on every classification request:** Session init is expensive (50-200ms). Initialize once in offscreen document's `DOMContentLoaded`, reuse for all requests. [CITED: onnxruntime.ai/docs]
- **Storing AI classification results in IndexedDB:** Classification results are ephemeral per-session data. Use `chrome.storage.local` for classification cache — fast, synchronous-ish, survives SW restart. IndexedDB is for behavioral history only.
- **Writing behavioral events inside `handleAlarmTick()`:** Alarm tick runs on a 1-minute poll. Behavioral events must be written immediately on `tabs.onActivated` / `tabs.onUpdated` in `index.ts`, not deferred to the tick.
- **Opening IndexedDB connection inside event handlers:** Always use the module-level `dbPromise` singleton (established pattern from `idb.ts`). Never call `openDB()` inside an event handler.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ML inference engine | Custom JavaScript classifier | ORT-Web | ONNX is the interop standard; ORT-Web handles WebGPU/WASM dispatch, tensor allocation, and session management |
| ONNX model export | Manual protobuf serialization | skl2onnx (offline Python) | sklearn-onnx handles all operator mapping; Decision Tree → ONNX in 5 lines of Python |
| WASM file serving | Custom fetch logic | vite-plugin-static-copy + chrome.runtime.getURL | Plugin handles build-time copy; URL pattern handles runtime path resolution |
| Offscreen Document recreation guard | Custom flag variable | `chrome.runtime.getContexts()` check + promise guard | Chrome 116+ API is the canonical check; promise guard prevents race conditions |
| Feature normalization | Manual min-max code | Inline normalization constants in `buildFeatureVector()` | Simple enough to inline; don't add a library |

**Key insight:** The ONNX model itself is the hardest part to get right. Using sklearn (offline) to generate a synthetic model from rule-based labels sidesteps the need for real training data while producing a valid, ORT-Web-compatible .onnx file that is < 50 KB.

---

## Common Pitfalls

### Pitfall 1: WASM Files Not Found at Runtime
**What goes wrong:** ORT-Web throws "Failed to fetch ort-wasm-simd-threaded.wasm" when the Offscreen Document initializes.
**Why it happens:** WASM files are not in `web_accessible_resources`, or `wasmPaths` still points to a relative path that doesn't resolve inside an extension context.
**How to avoid:** Use `vite-plugin-static-copy` to copy `node_modules/onnxruntime-web/dist/*.wasm` and `*.mjs` to `dist/ort/`. Set `ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')` **before** `InferenceSession.create()`. Add `"ort/*.wasm"` and `"ort/*.mjs"` to `web_accessible_resources`.
**Warning signs:** "Failed to fetch" errors in the offscreen document's DevTools console.

### Pitfall 2: Offscreen Document Created Twice (Race Condition)
**What goes wrong:** Two concurrent alarm ticks both call `ensureOffscreen()` before either completes, causing `chrome.offscreen.createDocument()` to throw "Only a single offscreen document may be created".
**Why it happens:** MV3 Service Workers handle events concurrently. `getContexts()` returns empty for both calls before either has created the document.
**How to avoid:** Use the `creatingOffscreen` promise guard (Pattern 1 above). The second caller awaits the same promise the first caller started.
**Warning signs:** Chrome extension error "Only a single offscreen document may be created per extension".

### Pitfall 3: IndexedDB Version Conflict
**What goes wrong:** Existing users with Phase 2's `smart-hibernator` database version 1 get an unhandled upgrade error when Phase 3 tries to open version 2.
**Why it happens:** `openDB()` with a higher version requires all open connections to close first. If the popup or SW still has an open connection at the old version, the upgrade blocks indefinitely.
**How to avoid:** In `idb.ts`, bump to version 2 and add `blocked()` and `blocking()` callbacks to the `openDB()` call. The `blocking()` callback should close the old connection; `blocked()` should log and proceed.
**Warning signs:** IndexedDB upgrade hangs forever; behavioral history never gets written.

### Pitfall 4: `chrome.storage.local` Quota for Classification Cache
**What goes wrong:** Storing classification results for 100+ tabs (each with label + confidence + cachedAt) plus behavioral signal counts approaches the `chrome.storage.local` 10 MB limit when combined with existing `tab_meta` and `hibernation_events`.
**Why it happens:** Each classification record is small, but `tab_meta` already grows with tab count.
**How to avoid:** Store only the classification cache as `{ [tabId]: { label, confidence, cachedAt } }` — prune stale entries (tabId no longer in current tab list) on each alarm tick. Estimated < 50 KB for 200 tabs.
**Warning signs:** `chrome.storage.local.set()` fails with QUOTA_BYTES_PER_ITEM error.

### Pitfall 5: Cold Start Misdetection
**What goes wrong:** AI activates on first install when `tab-history` store has 0 rows, producing random or 0-confidence classifications that immediately misclassify all tabs.
**Why it happens:** The ONNX model returns a valid tensor even with no meaningful input (all-zeros feature vector).
**How to avoid:** In `classifier.ts`, check total row count in `tab-history` before building a feature vector. If `totalRows < AI_COLD_START_MIN_SAMPLES` (recommend: 50), return `{ label: null, confidence: 0 }` and skip classification entirely. Same code path as D-07 low-confidence fallback.
**Warning signs:** All tabs immediately classified as Dead on first install, causing aggressive hibernation.

### Pitfall 6: CSP `wasm-unsafe-eval` Missing
**What goes wrong:** ORT-Web throws a CSP violation and WASM compilation fails silently or with a console error.
**Why it happens:** Default MV3 extension CSP disallows WASM compilation. The current `manifest.json` only has `script-src 'self'`.
**How to avoid:** Update `extension_pages` CSP to `"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline'"`. This is the **minimum** required change. [VERIFIED: Chrome extension CSP docs]
**Warning signs:** "Refused to compile or instantiate WebAssembly module because 'wasm-unsafe-eval' is not an allowed source" in console.

### Pitfall 7: Session Run Returns Wrong Tensor Shape
**What goes wrong:** `session.run()` throws or returns garbage because the input tensor shape doesn't match the ONNX model's expected input.
**Why it happens:** The ONNX model exported from sklearn expects shape `[1, 6]` (batch=1, features=6) but the tensor is created with wrong shape or wrong dtype.
**How to avoid:** Always use `new ort.Tensor('float32', data, [1, 6])` — shape must match `initial_types` used in `skl2onnx.convert_sklearn()`. Verify with `netron.app` or `python -c "import onnx; m = onnx.load('classifier.onnx'); print(m.graph.input)"` after export.
**Warning signs:** `OrtError: input[0] shape mismatch` in offscreen document console.

---

## Code Examples

Verified patterns from official sources:

### ORT-Web WebGPU Detection and Backend Selection
```typescript
// Source: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
async function getExecutionProviders(): Promise<string[]> {
  // navigator.gpu exists in offscreen document context (has DOM access)
  const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu
  return webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm']
}

const session = await ort.InferenceSession.create(modelBuffer, {
  executionProviders: await getExecutionProviders(),
})
```

### Batch Classification Message Protocol
```typescript
// SW → Offscreen Document request
interface ClassifyBatchRequest {
  type: 'CLASSIFY_BATCH'
  tabs: Array<{ tabId: number; features: number[] }>  // features = 6-element float array
}

// Offscreen Document → SW response
interface ClassifyBatchResponse {
  type: 'CLASSIFY_BATCH_RESULT'
  results: Array<{ tabId: number; label: 'Vital' | 'Semi-Active' | 'Dead' | null; confidence: number }>
}

// SW sends:
const response = await chrome.runtime.sendMessage({
  type: 'CLASSIFY_BATCH',
  tabs: candidateTabs.map(t => ({ tabId: t.id, features: buildFeaturesArray(t) }))
} satisfies ClassifyBatchRequest) as ClassifyBatchResponse
```

### Offline ONNX Model Generation (Wave 0 Python script)
```python
# Source: https://onnx.ai/sklearn-onnx/auto_examples/plot_convert_model.html
# Run once to generate classifier.onnx; committed to repository
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Synthetic training data: [revisitFreq, dwellTime, formActivity, categoryBoost, biasOffset, recency]
# Labels: 0=Dead, 1=Semi-Active, 2=Vital
X_train = np.array([...])  # generated from rules
y_train = np.array([...])

clf = DecisionTreeClassifier(max_depth=5)
clf.fit(X_train, y_train)

initial_type = [('float_input', FloatTensorType([None, 6]))]
onx = convert_sklearn(clf, initial_types=initial_type)
with open('src/assets/classifier.onnx', 'wb') as f:
    f.write(onx.SerializeToString())
```

### vite-plugin-static-copy Configuration
```typescript
// Source: https://github.com/vitejs/vite/discussions/15962
// vite.config.ts
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: 'ort',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: 'ort',
        },
      ],
    }),
  ],
  // ... existing config
})
```

### `isDiscardable()` AI Integration (hibernation.ts modification)
```typescript
// Extend existing isDiscardable() to accept AI classification result
export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number,
  classification?: { label: 'Vital' | 'Semi-Active' | 'Dead' | null; confidence: number }
): boolean {
  // ... existing checks ...

  // AI integration point (D-04, D-05, D-06, D-07)
  const AI_CONFIDENCE_THRESHOLD = 0.6  // D-07 Claude's discretion
  if (classification && classification.label && classification.confidence >= AI_CONFIDENCE_THRESHOLD) {
    if (classification.label === 'Vital') return false  // D-04: never hibernate
    if (classification.label === 'Semi-Active') {
      // D-05: 1.5x timeout
      if (now - lastActive < timeoutMs * 1.5) return false
      return true
    }
    if (classification.label === 'Dead') {
      // D-06: 0.5x timeout
      if (now - lastActive < timeoutMs * 0.5) return false
      return true
    }
  }
  // D-07 fallback: low confidence or no classification — use base timeoutMs
  if (now - lastActive < timeoutMs) return false
  return true
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WASM in SW global scope | WASM in Offscreen Document | Chrome MV3 (Chrome 88+) | SW global scope prohibits dynamic import(); offscreen document is the standard workaround |
| `chrome.offscreen.hasDocument()` | `chrome.runtime.getContexts()` | Chrome 116 (experimental API removed) | `hasDocument()` was only ever experimental; `getContexts()` is the canonical check |
| ORT-Web loaded from CDN | ORT-Web WASM bundled locally | MV3 CSP tightening (Chrome 103+) | Extensions cannot fetch from external CDNs at runtime; `wasm-unsafe-eval` + local files required |
| Multi-threaded WASM (default) | `numThreads=1` in extensions | Ongoing (SharedArrayBuffer restriction) | Threading requires cross-origin isolation headers that complicate extension CSP |

**Deprecated/outdated:**
- `Transformers.js` for tab classification: Uses large pretrained embedding models (25MB+); overkill for a 6-feature rule-based classifier. ORT-Web with a tiny sklearn-exported model is the right tool.
- `chrome.offscreen.hasDocument()`: Removed from Chrome API; use `getContexts()`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A Decision Tree with `max_depth=5` trained on a 6-feature synthetic dataset produces a valid classifier that generalizes to real tab usage patterns | Standard Stack, Code Examples | If wrong: classifier produces poor quality labels; mitigation: cold start period provides data to evaluate quality before users notice |
| A2 | `ort.wasm.min.js` (WASM-only bundle) is available and usable as an ES module import in the offscreen document via the CRXJS-bundled build | Standard Stack | If wrong: may need to use `ort.all.min.js` or adapt import path; investigate during Wave 0 |
| A3 | The `navigator.gpu` property is accessible in an Offscreen Document context (has DOM access unlike SW) | Pattern 2 | If wrong: WebGPU detection will always return false and all inference will use WASM; acceptable fallback but NFR-03 won't be met |
| A4 | Inference latency for a Decision Tree ONNX model with 6 float32 inputs is well under 10ms per run, easily meeting NFR-02 (150ms) even with batch processing 100 tabs | Common Pitfalls, Architecture | If wrong: batch size may need limiting; 150ms budget is generous for a tiny model |
| A5 | `skl2onnx` can be installed without conflicts on a Python 3.12 environment for the Wave 0 offline model generation step | Standard Stack | If wrong: use a virtual environment or Docker for the model generation step |
| A6 | CRXJS 2.4.0 correctly handles ES module imports in offscreen document entry points (same as popup and dashboard) | Architecture Patterns | If wrong: may need a separate Vite entry without CRXJS processing; investigate during Wave 0 |
| A7 | Cold start threshold of 50 behavioral records is a reasonable minimum before AI classification adds value | Code Examples | If wrong (too low): poor classifications during learning period; if wrong (too high): users never see AI benefits; easily tunable via constant |

---

## Open Questions

1. **ORT-Web WASM import mode in CRXJS builds**
   - What we know: CRXJS bundles ESM entry points; ORT-Web ships `ort.wasm.min.js` and ES module variants
   - What's unclear: Whether CRXJS correctly tree-shakes and resolves ORT-Web's dynamic WASM loading or whether a static script tag in `offscreen.html` is needed
   - Recommendation: Wave 0 task — try `import * as ort from 'onnxruntime-web/wasm'` in offscreen.ts first; fall back to `<script src="ort.wasm.min.js">` in offscreen.html if bundler fails

2. **WebGPU availability in Offscreen Document vs. Chrome version**
   - What we know: WebGPU available in Chrome 113+ for regular pages; offscreen documents have DOM but limited API surface
   - What's unclear: Exact Chrome version threshold for WebGPU in offscreen documents; whether GPU adapter is accessible
   - Recommendation: Defensive detection via `try { await navigator.gpu.requestAdapter() } catch { useFallback }` rather than property existence check only

3. **IndexedDB access from both SW and Offscreen Document**
   - What we know: Both SW and Offscreen Document can access the same IndexedDB origin; `idb.ts` singleton works per-context
   - What's unclear: Whether concurrent writes from SW (behavioral events) and reads from Offscreen Document (for feature vector assembly) cause transaction conflicts
   - Recommendation: Keep all IndexedDB writes in SW; Offscreen Document should not write to IndexedDB directly. SW assembles feature vectors and sends them to Offscreen Document. This avoids cross-context write conflicts.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, build | ✓ | (project running) | — |
| Python 3 | Wave 0: generate classifier.onnx | ✓ | 3.12.3 | — |
| pip/skl2onnx | Wave 0: sklearn model export | ✗ (skl2onnx not installed) | — | `pip install scikit-learn skl2onnx onnx` in Wave 0 |
| WebGPU (Chrome GPU) | ORT-Web WebGPU backend | Unknown — runtime detection | — | WASM fallback (automatic via executionProviders array) |

**Missing dependencies with no fallback:**
- None — skl2onnx can be pip-installed; WebGPU has WASM fallback

**Missing dependencies with fallback:**
- `skl2onnx`: Wave 0 task — `pip install scikit-learn skl2onnx onnx` before model generation

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-05 | `buildFeatureVector()` produces correct tensor shape | unit | `npm test -- src/background/classifier.test.ts` | ❌ Wave 0 |
| FR-05 | Offscreen message handler returns `{ label, confidence }` | unit (mock ORT session) | `npm test -- src/offscreen/main.test.ts` | ❌ Wave 0 |
| FR-06 | `tab-history` store writes and reads correctly with rolling window | unit | `npm test -- src/background/idb.test.ts` | ✅ (extend existing) |
| FR-06 | `domain-bias` store reads/writes on Keep Alive | unit | `npm test -- src/background/ai-learning.test.ts` | ❌ Wave 0 |
| FR-07 | `isDiscardable()` with Vital classification returns false | unit | `npm test -- src/background/hibernation.test.ts` | ✅ (extend existing) |
| FR-07 | `isDiscardable()` with Semi-Active returns true only after 1.5x timeout | unit | `npm test -- src/background/hibernation.test.ts` | ✅ (extend existing) |
| FR-07 | `isDiscardable()` with Dead returns true after 0.5x timeout | unit | `npm test -- src/background/hibernation.test.ts` | ✅ (extend existing) |
| FR-07 | Low confidence falls back to base timeout | unit | `npm test -- src/background/hibernation.test.ts` | ✅ (extend existing) |
| NFR-02 | Inference call completes in mock (structural) | unit | `npm test -- src/background/classifier.test.ts` | ❌ Wave 0 |
| NFR-04 | No `fetch()` calls with external URLs in offscreen document | unit (spy) | `npm test -- src/offscreen/main.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (full vitest suite — 39 existing tests + new)
- **Per wave merge:** `npm test` (full suite green)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/background/classifier.test.ts` — covers FR-05 feature vector, FR-07 cold start
- [ ] `src/background/ai-learning.test.ts` — covers FR-06 domain bias read/write, Keep Alive
- [ ] `src/offscreen/main.test.ts` — covers FR-05 message handler with mocked ORT session
- [ ] `src/popup/App.test.tsx` — extend to cover V/S/D pill rendering (D-12)
- [ ] `src/dashboard/App.test.tsx` — extend to cover AI summary section (D-13)
- [ ] Python Wave 0 script: `scripts/generate-model.py` — generates `src/assets/classifier.onnx`
- [ ] `pip install scikit-learn skl2onnx onnx` (one-time, Wave 0 setup)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Feature vector inputs are computed internally from trusted Chrome API data; no user input flows into ML inference directly |
| V6 Cryptography | no | — |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Model poisoning via learned domain biases | Tampering | Bias offsets are bounded to `-1.0..+1.0`; out-of-range values clamped on write |
| IndexedDB tab history exfiltration | Information Disclosure | IndexedDB is origin-scoped to the extension; no external fetch from offscreen document (NFR-04) |
| Cross-origin WASM injection | Elevation of Privilege | `web_accessible_resources` scoped; CSP `'self'` + `wasm-unsafe-eval` only; no remote script sources |

---

## Sources

### Primary (HIGH confidence)
- [chrome.offscreen API reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — createDocument, getContexts, Reason enum
- [Chrome Offscreen Documents blog](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) — lifecycle, message passing pattern
- [ORT-Web WebGPU docs](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) — executionProviders, session options
- [ORT-Web deploy docs](https://onnxruntime.ai/docs/tutorials/web/deploy.html) — wasmPaths, bundle variants
- [ORT-Web env flags docs](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) — numThreads, wasmPaths
- [Chrome CSP extension pages docs](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) — wasm-unsafe-eval
- [sklearn-onnx docs](https://onnx.ai/sklearn-onnx/) — convert_sklearn, FloatTensorType
- [CDN WASM file listing](https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/) — verified dist file names and sizes
- npm registry — onnxruntime-web@1.26.0 (2026-05-08), vite-plugin-static-copy@4.1.0

### Secondary (MEDIUM confidence)
- [GitHub issue microsoft/onnxruntime#20876](https://github.com/microsoft/onnxruntime/issues/20876) — WebGPU/WASM unavailable in SW; WebGPU now supported in Chrome 124+ SW but offscreen approach is safer/more portable
- [Chrome cross-origin isolation docs](https://developer.chrome.com/docs/extensions/develop/concepts/cross-origin-isolation) — SharedArrayBuffer / threading requirements
- [Transformers.js Chrome extension article](https://medium.com/@GenerationAI/transformers-js-onnx-runtime-webgpu-in-chrome-extension-13b563933ca9) — confirmed offscreen + message passing pattern
- [Practical Transformers.js patch article](https://medium.com/@vprprudhvi/running-transformers-js-inside-a-chrome-extension-manifest-v3-a-practical-patch-d7ce4d6a0eac) — wasmPaths configuration, web_accessible_resources pattern
- [DEV.to offscreen guide](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2) — full code pattern for createDocument + getContexts

### Tertiary (LOW confidence)
- [ORT-Web WASM size discussion](https://github.com/microsoft/onnxruntime/discussions/24161) — WASM file size numbers (~12-25MB depending on backend variant); approximate
- [GitHub ONNX Runtime MV3 discussion](https://github.com/microsoft/onnxruntime/discussions/23063) — unresolved but confirms wasm-unsafe-eval + web_accessible_resources pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ORT-Web 1.26.0 verified on npm; file names verified via CDN listing; vite-plugin-static-copy version verified
- Offscreen Document pattern: HIGH — official Chrome developer docs, multiple corroborating community implementations
- ONNX model architecture: MEDIUM — sklearn-onnx is well documented; specific feature vector design and synthetic data labels are ASSUMED (Claude's discretion)
- CSP and WASM configuration: HIGH — Chrome official CSP docs explicitly state `wasm-unsafe-eval` requirement
- Pitfalls: HIGH — each pitfall sourced from GitHub issues or official documentation

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days — ORT-Web releases frequently; re-verify version before execution)
