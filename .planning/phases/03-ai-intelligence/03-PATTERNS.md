# Phase 3: AI Intelligence - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 12 (6 to modify, 6 to create)
**Analogs found:** 10 / 12 (2 files — classifier.onnx and scripts/generate-model.py — have no TypeScript/React analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/background/hibernation.ts` (modify) | service | request-response | self — extend existing | exact |
| `src/background/index.ts` (modify) | service-worker entrypoint | event-driven | self — extend existing | exact |
| `src/background/idb.ts` (modify) | data-access | CRUD | self — extend existing | exact |
| `src/shared/types.ts` (modify) | types/config | — | self — extend existing | exact |
| `src/popup/App.tsx` (modify) | component | request-response | self — extend existing | exact |
| `src/dashboard/App.tsx` (modify) | component | request-response | self — extend existing | exact |
| `src/background/classifier.ts` (create) | service | request-response | `src/background/thumbnail.ts` | role-match |
| `src/background/ai-learning.ts` (create) | service | CRUD | `src/background/idb.ts` | role-match |
| `src/offscreen/main.ts` (create) | service-worker-like | event-driven | `src/background/index.ts` (message handler section) | partial-match |
| `src/offscreen/index.html` (create) | config | — | `src/popup/index.html` | role-match |
| `src/assets/classifier.onnx` (create) | binary asset | — | none — generated offline | no analog |
| `scripts/generate-model.py` (create) | build script | batch | none — Python, no precedent | no analog |

---

## Pattern Assignments

### `src/background/hibernation.ts` (modify — service, request-response)

**Analog:** self — lines 1–105 are the base; Phase 3 extends the function signatures.

**Imports pattern** (lines 1–3):
```typescript
import type { TabMeta, HibernationEvent } from '../shared/types'
import { FORM_PROTECTION_MS } from '../shared/constants'
import { updateBadge } from './badge'
```
Phase 3 adds: `import type { ClassificationResult } from '../shared/types'` and `import { AI_CONFIDENCE_THRESHOLD } from '../shared/constants'`

**Core pattern — isDiscardable() signature extension** (lines 5–31, extend):
```typescript
// CURRENT signature (lines 5–11):
export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number
): boolean {

// PHASE 3 — add optional 7th parameter AFTER all existing parameters:
export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number,
  classification?: ClassificationResult   // optional — undefined = cold start / low confidence
): boolean {
```

**AI integration block — insert before the final `return true`** (after line 28, before line 31):
```typescript
// AI classification integration (D-04 / D-05 / D-06 / D-07)
// Must come AFTER all structural guards (active, pinned, audible, url, protected)
// and BEFORE the base inactivity check
if (classification && classification.label !== null && classification.confidence >= AI_CONFIDENCE_THRESHOLD) {
  if (classification.label === 'Vital') return false                          // D-04
  if (classification.label === 'Semi-Active') {
    if (now - lastActive < timeoutMs * 1.5) return false                     // D-05
    return true
  }
  if (classification.label === 'Dead') {
    if (now - lastActive < timeoutMs * 0.5) return false                     // D-06
    return true
  }
}
// D-07 fallback: low confidence, null label, or cold start — use base timeoutMs exactly
```

**handleAlarmTick() extension pattern** (lines 33–91):
```typescript
// The EXISTING atomic storage read (lines 35–41) — Phase 3 adds 'ai_classifications' to this same call:
const result = await chrome.storage.local.get([
  'hibernation_enabled',
  'tab_meta',
  'protected_tabs',
  'protected_domains',
  'timeout_minutes',
  'ai_classifications',   // NEW — Phase 3: { [tabId]: ClassificationResult }
])

// EXISTING discard loop pattern (lines 58–83) — Phase 3 inserts classification lookup per tab:
for (const tab of tabs) {
  if (!tab.id) continue
  const meta = tabMeta[tab.id]
  const classification = aiClassifications[tab.id]   // NEW — may be undefined (cold start)
  if (!isDiscardable(tab, meta, now, protectedTabs, protectedDomains, timeoutMs, classification)) continue
  // ... rest of loop unchanged
}
```

**Error handling pattern** (lines 63–83 — existing try/catch to replicate):
```typescript
try {
  const discarded = await chrome.tabs.discard(tab.id)
  if (discarded !== undefined) {
    // ... storage update
  }
} catch {
  // Tab may have been closed between query and discard — silently continue
}
```

---

### `src/background/index.ts` (modify — SW entrypoint, event-driven)

**Analog:** self — lines 1–127 are the base.

**Top-level listener registration pattern** (lines 1–14, critical constraint):
```typescript
// Service Worker entry point
// CRITICAL: ALL listeners registered synchronously at module top level
// Do NOT move any listener registration inside async callbacks
import { handleAlarmTick, handleManualHibernate } from './hibernation'
// ...

// Top-level call — runs on EVERY SW restart, not just install:
ensureHibernateAlarm()
```
Phase 3 adds: `import { ensureOffscreen } from './classifier'` and calls `ensureOffscreen()` at module top-level (before the first alarm tick).

**Behavioral event hook pattern — extend existing onActivated** (lines 52–58):
```typescript
// EXISTING (lines 52–58):
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.get('tab_meta', (result) => {
    const tab_meta = (result.tab_meta as Record<number, ...>) || {}
    tab_meta[tabId] = { ...tab_meta[tabId], lastActiveAt: Date.now() }
    chrome.storage.local.set({ tab_meta })
  })
})

// PHASE 3 — write behavioral event to IndexedDB in SAME listener (non-blocking):
chrome.tabs.onActivated.addListener(({ tabId }) => {
  const now = Date.now()
  // Existing storage update (keep as-is):
  chrome.storage.local.get('tab_meta', (result) => { /* ... */ })
  // NEW: record activation event for behavioral history (fire-and-forget):
  recordTabActivation(tabId, now).catch(() => {})  // from ai-learning.ts
})
```

**onMessage handler extension pattern** (lines 80–99 — replicate existing message type pattern):
```typescript
// EXISTING pattern — check type, act, return:
if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) { /* ... */; return }
if (message.type === 'MANUAL_HIBERNATE' && typeof message.tabId === 'number') { /* ... */; return }
if (message.type === 'CAPTURE_TAB' && ...) { /* ... */ }

// PHASE 3 — add after CAPTURE_TAB block, same pattern:
if (message.type === 'KEEP_ALIVE' && typeof message.tabId === 'number') {
  recordKeepAlive(message.tabId as number, message.domain as string).catch(() => {})
  return
}
```

**Offscreen Document guard — add before alarms.onAlarm** (top-level, before line 46):
```typescript
// Phase 3: Ensure offscreen document exists on every SW load
// Use module-level promise guard — Pattern 1 from RESEARCH.md
let creatingOffscreen: Promise<void> | null = null

export async function ensureOffscreen(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('src/offscreen/index.html')
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  })
  if (contexts.length > 0) return
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

---

### `src/background/idb.ts` (modify — data-access, CRUD)

**Analog:** self — the entire file is the pattern to extend.

**Module-level singleton pattern** (lines 20–33 — MUST replicate, never call openDB inside handlers):
```typescript
// EXISTING — module-level singleton, never inside event handlers:
let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null

function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'tabId' })
        }
      },
    })
  }
  return dbPromise
}
```

**Phase 3 DB version bump + new stores** (replace the singleton above):
```typescript
// Phase 3: bump to version 2; add tab-history and domain-bias stores
// IMPORTANT: reset dbPromise to null — new export replaces old getDb()
let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null

function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('thumbnails')) {
            db.createObjectStore('thumbnails', { keyPath: 'tabId' })
          }
        }
        if (oldVersion < 2) {
          const histStore = db.createObjectStore('tab-history', { keyPath: 'id', autoIncrement: true })
          histStore.createIndex('by-domain', 'domain')
          histStore.createIndex('by-timestamp', 'timestamp')
          db.createObjectStore('domain-bias', { keyPath: 'domain' })
        }
      },
      blocked() {
        console.warn('[smart-hibernator] IDB upgrade blocked — close other extension tabs')
      },
      blocking() {
        // Close our connection so the other context can upgrade
        dbPromise = null
      },
    })
  }
  return dbPromise
}
```

**CRUD function pattern** (lines 35–53 — replicate shape for new stores):
```typescript
// Existing pattern for thumbnails — replicate for tab-history and domain-bias:
export async function putThumbnail(record: ThumbnailRecord): Promise<void> {
  const db = await getDb()
  await db.put('thumbnails', record)
}

export async function getThumbnail(tabId: number): Promise<ThumbnailRecord | undefined> {
  const db = await getDb()
  return db.get('thumbnails', tabId)
}
```

**Phase 3 new CRUD functions to add** (replicate pattern above):
```typescript
// tab-history store
export async function appendTabHistory(record: TabHistoryRecord): Promise<void> {
  const db = await getDb()
  await db.add('tab-history', record)  // add (not put) — auto-increment key
}

export async function getTabHistoryByDomain(domain: string, since: number): Promise<TabHistoryRecord[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('tab-history', 'by-domain', domain)
  return all.filter((r) => r.timestamp >= since)
}

export async function countTabHistory(): Promise<number> {
  const db = await getDb()
  return db.count('tab-history')
}

export async function pruneTabHistory(cutoff: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('tab-history', 'readwrite')
  const index = tx.store.index('by-timestamp')
  // IDBKeyRange.upperBound(cutoff) — delete all older than cutoff
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

// domain-bias store
export async function getDomainBias(domain: string): Promise<DomainBiasRecord | undefined> {
  const db = await getDb()
  return db.get('domain-bias', domain)
}

export async function putDomainBias(record: DomainBiasRecord): Promise<void> {
  const db = await getDb()
  await db.put('domain-bias', record)
}
```

**IDB type schema extension** (lines 13–18 — extend SmartHibernatorDB interface):
```typescript
// EXISTING:
interface SmartHibernatorDB {
  thumbnails: {
    key: number
    value: ThumbnailRecord
  }
}

// PHASE 3 — add stores to the same interface:
interface SmartHibernatorDB {
  thumbnails: {
    key: number
    value: ThumbnailRecord
  }
  'tab-history': {
    key: number           // auto-increment
    value: TabHistoryRecord
    indexes: { 'by-domain': string; 'by-timestamp': number }
  }
  'domain-bias': {
    key: string           // domain string
    value: DomainBiasRecord
  }
}
```

---

### `src/shared/types.ts` (modify — types, —)

**Analog:** self — lines 1–37 are the base.

**Interface extension pattern** (lines 1–22 — replicate additive style):
```typescript
// EXISTING interfaces:
export interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

export interface StorageSchema {
  hibernation_enabled: boolean
  // ...
  hibernation_events: HibernationEvent[]
}
```

**Phase 3 new types to append** (add after existing exports):
```typescript
// Phase 3: AI classification types
export type TabVitality = 'Vital' | 'Semi-Active' | 'Dead'

export interface ClassificationResult {
  label: TabVitality | null    // null = cold start or low confidence
  confidence: number            // 0.0 – 1.0
  cachedAt: number              // unix ms — prune when tabId gone
}

// Records stored in IndexedDB 'tab-history' object store
export interface TabHistoryRecord {
  id?: number                   // auto-increment keyPath
  domain: string                // e.g. "github.com"
  url: string
  visitStart: number            // unix ms
  visitEnd: number              // unix ms — 0 if tab still open
  dwellMs: number               // visitEnd - visitStart
  hadFormActivity: boolean
  timestamp: number             // same as visitStart; for rolling window index
}

// Records stored in IndexedDB 'domain-bias' object store
export interface DomainBiasRecord {
  domain: string                // keyPath
  biasOffset: number            // -1.0 to +1.0; clamped on write
  keepAliveCount: number
  misclassificationCount: number
  updatedAt: number
}

// Phase 3 StorageSchema additions — append to existing StorageSchema:
// (modify inline in the interface)
export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
  timeout_minutes: number
  hibernation_events: HibernationEvent[]
  ai_classifications: Record<number, ClassificationResult>  // NEW Phase 3
  ai_install_date: number                                   // NEW Phase 3 — for cold start countdown
}
```

---

### `src/background/classifier.ts` (create — service, request-response)

**Analog:** `src/background/thumbnail.ts` — same role (SW utility service that assembles data + calls a side-channel for processing + writes result to storage).

**Imports pattern** (thumbnail.ts lines 1–5 — replicate import style):
```typescript
// thumbnail.ts:
import { putThumbnail, pruneIfNeeded } from './idb'
import { THUMBNAIL_MAX_SIZE_BYTES } from '../shared/constants'

// classifier.ts — same style:
import { getTabHistoryByDomain, getDomainBias, countTabHistory } from './idb'
import {
  AI_CONFIDENCE_THRESHOLD,
  AI_COLD_START_MIN_SAMPLES,
  AI_HISTORY_WINDOW_MS,
  VITAL_DOMAINS,
  DEAD_DOMAINS,
} from '../shared/constants'
import type { ClassificationResult, TabVitality } from '../shared/types'
```

**Core utility function pattern** (thumbnail.ts lines 13–38 — replicate pure async function shape):
```typescript
// thumbnail.ts pattern:
export async function compressToWebP(pngDataUrl: string): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    // ... processing
    return result
  } catch {
    return null
  }
}

// classifier.ts — replicate this shape for feature vector builder:
export async function buildFeaturesForTab(
  tabId: number,
  url: string,
  meta: TabMeta
): Promise<number[] | null> {
  const totalRows = await countTabHistory()
  if (totalRows < AI_COLD_START_MIN_SAMPLES) return null   // cold start — same pattern as OffscreenCanvas undefined check

  try {
    const domain = new URL(url).hostname
    const since = Date.now() - AI_HISTORY_WINDOW_MS
    const history = await getTabHistoryByDomain(domain, since)
    const bias = await getDomainBias(domain)

    // Normalize 6 features into [0, 1] float32 range
    const revisitFreq = Math.min(history.length / 30, 1)
    const avgDwellMs = history.length > 0
      ? history.reduce((s, r) => s + r.dwellMs, 0) / history.length
      : 0
    const dwellTime = Math.min(avgDwellMs / (3600 * 1000), 1)
    const formActivity = meta.lastFormActivity ? 1 : 0
    const domainCategoryBoost = getDomainCategoryBoost(domain)
    const domainBiasOffset = bias ? Math.max(-1, Math.min(1, bias.biasOffset)) : 0
    const hoursSinceLast = history.length > 0
      ? (Date.now() - Math.max(...history.map((r) => r.timestamp))) / (1000 * 3600)
      : 336   // 14 days = max recency score
    const recency = Math.min(hoursSinceLast / 336, 1)

    return [revisitFreq, dwellTime, formActivity, domainCategoryBoost, domainBiasOffset, recency]
  } catch {
    return null
  }
}
```

**captureAndStore analog — classify and cache** (thumbnail.ts lines 53–64 — replicate orchestrator shape):
```typescript
// thumbnail.ts:
export async function captureAndStore(tabId: number, url: string, windowId: number): Promise<void> {
  try {
    const pngDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    const dataUrl = await compressToWebP(pngDataUrl)
    if (dataUrl) {
      await putThumbnail({ tabId, url, dataUrl, capturedAt: Date.now() })
      await pruneIfNeeded()
    }
  } catch {
    // silently continue
  }
}

// classifier.ts analog — classifyBatch sends to offscreen and caches results:
export async function classifyBatch(
  candidateTabs: Array<{ tabId: number; url: string; meta: TabMeta }>
): Promise<void> {
  try {
    const payloads = await Promise.all(
      candidateTabs.map(async ({ tabId, url, meta }) => {
        const features = await buildFeaturesForTab(tabId, url, meta)
        return features ? { tabId, features } : null
      })
    )
    const toClassify = payloads.filter(Boolean) as Array<{ tabId: number; features: number[] }>
    if (toClassify.length === 0) return

    const response = await chrome.runtime.sendMessage({
      type: 'CLASSIFY_BATCH',
      tabs: toClassify,
    }) as { results: Array<{ tabId: number; label: TabVitality | null; confidence: number }> }

    // Cache results in chrome.storage.local (ephemeral, fast access for popup + alarm tick)
    const current = await chrome.storage.local.get('ai_classifications')
    const cache = (current['ai_classifications'] as Record<number, ClassificationResult>) ?? {}
    const now = Date.now()
    for (const r of response.results) {
      cache[r.tabId] = { label: r.label, confidence: r.confidence, cachedAt: now }
    }
    await chrome.storage.local.set({ ai_classifications: cache })
  } catch {
    // Offscreen document may not be ready — silently skip, next tick will retry
  }
}
```

---

### `src/background/ai-learning.ts` (create — service, CRUD)

**Analog:** `src/background/idb.ts` — same data-access role; `src/background/thumbnail.ts` — same service utility shape.

**Imports pattern** (replicate idb.ts line 3–4 style):
```typescript
import {
  getDomainBias,
  putDomainBias,
  appendTabHistory,
  countTabHistory,
} from './idb'
import type { DomainBiasRecord, TabHistoryRecord } from '../shared/types'
import { AI_WAKE_SIGNAL_WINDOW_MS, AI_BIAS_MAX } from '../shared/constants'
```

**Core CRUD function pattern** (idb.ts lines 35–48 — replicate function shape):
```typescript
// idb.ts pattern:
export async function putThumbnail(record: ThumbnailRecord): Promise<void> {
  const db = await getDb()
  await db.put('thumbnails', record)
}

// ai-learning.ts — replicate for domain bias operations:
export async function recordKeepAlive(tabId: number, domain: string): Promise<void> {
  const existing = await getDomainBias(domain)
  const record: DomainBiasRecord = {
    domain,
    biasOffset: Math.min(AI_BIAS_MAX, (existing?.biasOffset ?? 0) + 0.2),  // clamped
    keepAliveCount: (existing?.keepAliveCount ?? 0) + 1,
    misclassificationCount: existing?.misclassificationCount ?? 0,
    updatedAt: Date.now(),
  }
  await putDomainBias(record)
}

export async function recordTabActivation(tabId: number, timestamp: number): Promise<void> {
  // Called from index.ts onActivated — open visit window
  // Store visit-start in memory; close it in onDeactivated or onRemoved
  openVisits.set(tabId, timestamp)
}

export async function closeTabVisit(tabId: number, hadFormActivity: boolean, url: string): Promise<void> {
  const visitStart = openVisits.get(tabId)
  if (!visitStart) return
  openVisits.delete(tabId)
  try {
    const domain = new URL(url).hostname
    const now = Date.now()
    const record: TabHistoryRecord = {
      domain,
      url,
      visitStart,
      visitEnd: now,
      dwellMs: now - visitStart,
      hadFormActivity,
      timestamp: visitStart,
    }
    await appendTabHistory(record)
  } catch {
    // Invalid URL — skip
  }
}

export async function recordWakeMisclassification(tabId: number, domain: string): Promise<void> {
  const existing = await getDomainBias(domain)
  const timeSinceDiscard = Date.now() - (existing?.updatedAt ?? 0)
  if (timeSinceDiscard > AI_WAKE_SIGNAL_WINDOW_MS) return  // outside short-window — not a signal

  const record: DomainBiasRecord = {
    domain,
    biasOffset: Math.min(AI_BIAS_MAX, (existing?.biasOffset ?? 0) + 0.1),
    keepAliveCount: existing?.keepAliveCount ?? 0,
    misclassificationCount: (existing?.misclassificationCount ?? 0) + 1,
    updatedAt: Date.now(),
  }
  await putDomainBias(record)
}
```

**Module-level open visits map** (replicate idb.ts dbPromise singleton pattern — module-level state):
```typescript
// idb.ts: let dbPromise: Promise<...> | null = null  — module-level state

// ai-learning.ts analog:
const openVisits = new Map<number, number>()  // tabId → visitStart unix ms
```

---

### `src/offscreen/main.ts` (create — offscreen entrypoint, event-driven)

**Analog:** `src/background/index.ts` — same message-listener entrypoint pattern; `src/content/form-watcher.ts` — same isolated-context script that sends/receives chrome.runtime messages.

**Imports pattern** (index.ts lines 1–10 — replicate clean import style):
```typescript
// index.ts:
import { handleAlarmTick, handleManualHibernate } from './hibernation'
import { ALARM_NAME } from '../shared/constants'

// offscreen/main.ts — same style, different imports:
import * as ort from 'onnxruntime-web/wasm'  // WASM-only bundle per RESEARCH.md A2
import type { TabVitality } from '../shared/types'
```

**Module-level session singleton** (replicate idb.ts dbPromise pattern exactly):
```typescript
// idb.ts: let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null
// offscreen/main.ts analog:
let session: ort.InferenceSession | null = null
let sessionInit: Promise<void> | null = null
```

**Session initialization** (replicate idb.ts getDb() lazy-init pattern):
```typescript
// idb.ts pattern:
function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 1, { ... })
  }
  return dbPromise
}

// offscreen/main.ts analog:
async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session
  if (!sessionInit) {
    sessionInit = (async () => {
      // Configure WASM paths BEFORE session creation (RESEARCH.md Pitfall 1)
      ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')
      ort.env.wasm.numThreads = 1   // no SharedArrayBuffer in extensions

      const modelUrl = chrome.runtime.getURL('assets/classifier.onnx')
      const modelBuffer = await fetch(modelUrl).then((r) => r.arrayBuffer())

      const webgpuAvailable = typeof navigator !== 'undefined' && !!navigator.gpu
      const eps = webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm']

      session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: eps,
      })
    })()
    await sessionInit
    sessionInit = null
  } else {
    await sessionInit
  }
  return session!
}
```

**Message listener pattern** (replicate index.ts onMessage pattern, lines 80–99):
```typescript
// index.ts pattern:
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) { /* ... */; return }
  if (message.type === 'MANUAL_HIBERNATE' && typeof message.tabId === 'number') { /* ... */; return }
})

// offscreen/main.ts — same synchronous listener registration at module top level:
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CLASSIFY_BATCH') {
    handleClassifyBatch(
      message.tabs as Array<{ tabId: number; features: number[] }>
    ).then(sendResponse).catch((err) => {
      console.error('[smart-hibernator/offscreen] classify failed', err)
      sendResponse({ results: [] })
    })
    return true  // keep message channel open for async response
  }
})

async function handleClassifyBatch(
  tabs: Array<{ tabId: number; features: number[] }>
): Promise<{ results: Array<{ tabId: number; label: TabVitality | null; confidence: number }> }> {
  const sess = await getSession()
  const LABELS: TabVitality[] = ['Dead', 'Semi-Active', 'Vital']  // must match skl2onnx label order

  const results = await Promise.all(
    tabs.map(async ({ tabId, features }) => {
      try {
        const tensor = new ort.Tensor('float32', new Float32Array(features), [1, 6])
        const output = await sess.run({ float_input: tensor })
        // sklearn Decision Tree: output_probability shape [1, 3]; output_label shape [1]
        const probTensor = output['output_probability'] ?? output[Object.keys(output)[1]]
        const probs = probTensor.data as Float32Array
        const maxIdx = probs.indexOf(Math.max(...Array.from(probs)))
        const confidence = probs[maxIdx]
        const label = LABELS[maxIdx] ?? null
        return { tabId, label, confidence }
      } catch {
        return { tabId, label: null as TabVitality | null, confidence: 0 }
      }
    })
  )
  return { results }
}
```

**DOMContentLoaded init** (replicate popup/main.tsx pattern of running code on document ready):
```typescript
// popup/main.tsx:
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// offscreen/main.ts — init session eagerly on document load:
document.addEventListener('DOMContentLoaded', () => {
  // Warm up session on load — avoids cold start on first alarm tick
  getSession().catch((err) => console.error('[smart-hibernator/offscreen] session init failed', err))
})
```

---

### `src/offscreen/index.html` (create — config, —)

**Analog:** `src/popup/index.html` and `src/dashboard/index.html` — same CRXJS HTML entry point pattern.

**Exact structure to copy** (popup/index.html lines 1–13):
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Smart Hibernator — Offscreen</title>
    <!-- NO stylesheet — offscreen document has no visible UI -->
  </head>
  <body>
    <!-- No #root div — offscreen document is not a React app -->
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Note: Unlike popup/index.html and dashboard/index.html, offscreen does NOT import a CSS file and does NOT have a `<div id="root">`. The `<script>` tag points to `main.ts` (TypeScript, CRXJS resolves it).

---

### `src/popup/App.tsx` (modify — component, request-response)

**Analog:** self — the entire existing App.tsx is the base.

**HibernatedTabRow interface extension** (lines 10–17 — add classification field):
```typescript
// EXISTING:
interface HibernatedTabRow {
  id: number
  title: string
  url: string
  domain: string
  favIconUrl: string | undefined
  dataUrl: string | undefined
}

// PHASE 3 — add:
interface HibernatedTabRow {
  id: number
  title: string
  url: string
  domain: string
  favIconUrl: string | undefined
  dataUrl: string | undefined
  classification: ClassificationResult | undefined   // NEW
}
```

**Storage read extension** (lines 51–67 — add ai_classifications to the batch get):
```typescript
// EXISTING (lines 51–67):
chrome.storage.local.get(
  ['hibernation_enabled', 'hibernated_count', 'protected_tabs'],
  (result) => { /* ... */ }
)

// PHASE 3 — add 'ai_classifications' to same call:
chrome.storage.local.get(
  ['hibernation_enabled', 'hibernated_count', 'protected_tabs', 'ai_classifications'],
  (result) => {
    const aiClassifications = (result['ai_classifications'] as Record<number, ClassificationResult>) ?? {}
    // pass into loadHibernatedTabs() as argument
  }
)
```

**loadHibernatedTabs enrichment** (lines 72–89 — add classification lookup per tab):
```typescript
// EXISTING — map discarded tabs to rows:
const rows: HibernatedTabRow[] = await Promise.all(
  discardedTabs.map(async (tab) => {
    const record = tab.id ? await getThumbnail(tab.id) : undefined
    return {
      id: tab.id!,
      title: tab.title ?? 'Unknown Tab',
      url: tab.url ?? '',
      domain: tab.url ? (() => { try { return new URL(tab.url!).hostname } catch { return '' } })() : '',
      favIconUrl: tab.favIconUrl,
      dataUrl: record?.dataUrl,
    }
  })
)

// PHASE 3 — add classification field:
return {
  id: tab.id!,
  // ... existing fields ...
  classification: aiClassifications[tab.id!],   // undefined = cold start / no data
}
```

**V/S/D pill badge in tab row** (lines 253–297 — insert badge alongside "Wake Tab" button):
```typescript
// EXISTING tab row render (lines 253–299):
<div key={tab.id} className="flex items-center gap-2 min-h-16 py-2 border-b border-white/10 hover:bg-white/5">
  {/* Thumbnail cell */}
  {/* Title + domain */}
  {/* Wake Tab button */}
</div>

// PHASE 3 — add pill badge BEFORE Wake Tab button. Use Badge from existing import:
// Badge is already imported in dashboard/App.tsx (line 7) — import it in popup too
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

// In tab row JSX, before the Wake Tab Button:
{tab.classification?.label && (
  <Badge
    className={cn(
      'h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-semibold shrink-0',
      tab.classification.label === 'Vital' && 'bg-green-600 border-green-500 text-white',
      tab.classification.label === 'Semi-Active' && 'bg-amber-500 border-amber-400 text-white',
      tab.classification.label === 'Dead' && 'bg-zinc-600 border-zinc-500 text-zinc-300',
    )}
  >
    {tab.classification.label === 'Vital' ? 'V' : tab.classification.label === 'Semi-Active' ? 'S' : 'D'}
  </Badge>
)}

// Keep Alive button (after V/S/D badge, before Wake Tab button):
<Button
  variant="outline"
  size="sm"
  onClick={() => handleKeepAlive(tab.id, tab.domain)}
  className="h-8 px-2 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-green-900 active:bg-green-800 text-xs font-normal shrink-0"
  title="Mark as important — teaches AI this domain is vital"
>
  Keep
</Button>
```

**handleKeepAlive handler** (replicate handleWakeTab pattern, lines 155–168):
```typescript
// EXISTING handleWakeTab pattern:
async function handleWakeTab(tabId: number) {
  setState((prev) => ({ ...prev, wakingTabId: tabId }))
  try {
    await chrome.tabs.update(tabId, { active: true })
    await deleteThumbnail(tabId)
    setState((prev) => ({ ...prev, wakingTabId: null, hibernatedTabs: ... }))
  } catch {
    setState((prev) => ({ ...prev, wakingTabId: null }))
  }
}

// PHASE 3 — Keep Alive handler (simpler — just sends message):
function handleKeepAlive(tabId: number, domain: string) {
  chrome.runtime.sendMessage({ type: 'KEEP_ALIVE', tabId, domain }).catch(() => {})
}
```

---

### `src/dashboard/App.tsx` (modify — component, request-response)

**Analog:** self — the entire existing App.tsx is the base.

**DashboardState extension** (lines 22–29 — add AI summary fields):
```typescript
// EXISTING:
interface DashboardState {
  hibernatedCount: number
  hibernationEvents: HibernationEvent[]
  timeoutMinutes: number
  protectedDomains: string[]
  domainInput: string
  domainError: string
  isRefreshing: boolean
}

// PHASE 3 — add:
interface DashboardState {
  // ... existing fields ...
  aiClassifications: Record<number, ClassificationResult>
  aiInstallDate: number
}
```

**Storage read extension** (lines 61–69 — add keys to existing batch get):
```typescript
// EXISTING:
chrome.storage.local.get(
  ['hibernated_count', 'hibernation_events', 'timeout_minutes', 'protected_domains'],
  (result) => { /* ... */ }
)

// PHASE 3 — add to same call:
chrome.storage.local.get(
  ['hibernated_count', 'hibernation_events', 'timeout_minutes', 'protected_domains',
   'ai_classifications', 'ai_install_date'],   // NEW
  (result) => {
    setState((prev) => ({
      ...prev,
      // ... existing fields ...
      aiClassifications: (result['ai_classifications'] as Record<number, ClassificationResult>) ?? {},
      aiInstallDate: (result['ai_install_date'] as number) ?? Date.now(),
    }))
  }
)
```

**AI summary section in Stats tab** (insert after line 237, after the Recharts chart block — replicate existing card pattern):
```typescript
// EXISTING card pattern (lines 195–219):
<div className="bg-zinc-900 rounded-xl p-6 border border-white/10">
  <h2 className="text-xl font-semibold text-zinc-50 mb-4">Last 7 Days</h2>
  <ResponsiveContainer width="100%" height={160}>...</ResponsiveContainer>
</div>

// PHASE 3 — AI summary section (same card shape, placed BELOW the Recharts card):
// Derived data:
const classifications = Object.values(state.aiClassifications)
const vitalCount = classifications.filter((c) => c.label === 'Vital').length
const semiCount = classifications.filter((c) => c.label === 'Semi-Active').length
const deadCount = classifications.filter((c) => c.label === 'Dead').length
const AI_LEARNING_DAYS = 14
const daysSinceInstall = Math.floor((Date.now() - state.aiInstallDate) / (24 * 3600 * 1000))
const daysRemaining = Math.max(0, AI_LEARNING_DAYS - daysSinceInstall)

// JSX card:
<div className="bg-zinc-900 rounded-xl p-6 border border-white/10 mt-4">
  <h2 className="text-xl font-semibold text-zinc-50 mb-4">AI Classification</h2>
  {/* Classification breakdown row */}
  <div className="flex items-center gap-6 mb-4">
    <div className="flex items-center gap-2">
      <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-semibold bg-green-600 text-white">V</Badge>
      <span className="text-sm font-normal text-zinc-50 tabular-nums">{vitalCount}</span>
      <span className="text-xs text-zinc-400">Vital</span>
    </div>
    <div className="flex items-center gap-2">
      <Badge className="h-5 w-5 p-0 ... bg-amber-500 text-white">S</Badge>
      <span className="text-sm font-normal text-zinc-50 tabular-nums">{semiCount}</span>
      <span className="text-xs text-zinc-400">Semi-Active</span>
    </div>
    <div className="flex items-center gap-2">
      <Badge className="h-5 w-5 p-0 ... bg-zinc-600 text-zinc-300">D</Badge>
      <span className="text-sm font-normal text-zinc-50 tabular-nums">{deadCount}</span>
      <span className="text-xs text-zinc-400">Dead</span>
    </div>
  </div>
  {/* Learning status */}
  <p className="text-xs font-normal text-zinc-400">
    {daysRemaining > 0
      ? `AI tuning: ${daysRemaining} days remaining`
      : 'AI tuned ✓'}
  </p>
</div>
```

---

## Shared Patterns

### Module-Level Singleton (never inside event handlers)
**Source:** `src/background/idb.ts` lines 20–33
**Apply to:** `src/background/classifier.ts` (ensureOffscreen promise guard), `src/offscreen/main.ts` (session singleton), `src/background/ai-learning.ts` (openVisits Map)
```typescript
// The invariant: module-level state initialized lazily, never inside chrome.* listeners
let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null
// Pattern: check → create → assign; second caller awaits first caller's promise
```

### Atomic Chrome Storage Read
**Source:** `src/background/hibernation.ts` lines 35–41
**Apply to:** `src/background/hibernation.ts` (extend existing call), `src/popup/App.tsx` (extend existing call), `src/dashboard/App.tsx` (extend existing call)
```typescript
// Read ALL keys in one call — avoid multiple roundtrips
const result = await chrome.storage.local.get([
  'key1', 'key2', /* ...all keys needed */
])
```

### Chrome Storage Live Subscription
**Source:** `src/popup/App.tsx` lines 92–119, `src/dashboard/App.tsx` lines 74–88
**Apply to:** `src/popup/App.tsx` (extend existing listener), `src/dashboard/App.tsx` (extend existing listener)
```typescript
const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
  const updates: Partial<State> = {}
  if ('key' in changes) updates.field = changes['key'].newValue as Type
  if (Object.keys(updates).length > 0) setState((prev) => ({ ...prev, ...updates }))
}
chrome.storage.onChanged.addListener(listener)
return () => chrome.storage.onChanged.removeListener(listener)
```

### Silent Error Handling (background services)
**Source:** `src/background/hibernation.ts` lines 63–83, `src/background/thumbnail.ts` lines 53–64
**Apply to:** `src/background/classifier.ts`, `src/background/ai-learning.ts`, `src/offscreen/main.ts`
```typescript
// Background service pattern: try/catch at function level, never throw, always return
try {
  // ... async operation
} catch {
  // [short human-readable reason] — silently continue
}
```

### Top-Level Synchronous Listener Registration
**Source:** `src/background/index.ts` lines 1–14 (comment + ensureHibernateAlarm call)
**Apply to:** `src/offscreen/main.ts` (onMessage registration), `src/background/index.ts` (new KEEP_ALIVE handler)
```typescript
// CRITICAL: ALL chrome.* listeners registered synchronously at module top level
// Never inside async callbacks, setTimeout, or promises
chrome.runtime.onMessage.addListener((message, sender) => { /* ... */ })
```

### Tailwind Dark Theme Card Pattern
**Source:** `src/dashboard/App.tsx` lines 195–219
**Apply to:** `src/dashboard/App.tsx` AI summary section
```typescript
// All content cards follow: bg-zinc-900 rounded-xl p-6 border border-white/10
// Headings: text-xl font-semibold text-zinc-50
// Sub-text: text-xs font-normal text-zinc-400
```

### Button Variant Pattern (popup row actions)
**Source:** `src/popup/App.tsx` lines 284–296 (Wake Tab button)
**Apply to:** `src/popup/App.tsx` Keep Alive button
```typescript
<Button
  variant="outline"
  size="sm"
  className="h-8 px-3 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 active:bg-zinc-600 text-xs font-normal shrink-0"
>
  Wake Tab
</Button>
// Keep Alive: same shape, different hover color (green-900) and label
```

### Test File Structure (vitest + vitest-chrome)
**Source:** `src/background/hibernation.test.ts` and `src/background/idb.test.ts`
**Apply to:** All new test files (`classifier.test.ts`, `ai-learning.test.ts`, `offscreen/main.test.ts`, extended popup/dashboard tests)
```typescript
// Pattern:
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { functionUnderTest } from './module-under-test'

// Mock chrome APIs and dependencies with vi.mock():
vi.mock('./idb', () => ({
  getDomainBias: vi.fn().mockResolvedValue(undefined),
  // ...
}))

// Helper factory functions for test data:
function makeRecord(overrides: Partial<RecordType> = {}): RecordType {
  return { field1: defaultValue, ...overrides }
}

describe('module function (FR-XX)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('descriptive behavior statement', async () => {
    expect(await functionUnderTest(args)).toBe(expectedValue)
  })
})
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/assets/classifier.onnx` | binary asset | — | Generated offline by Python script; no TypeScript analog exists |
| `scripts/generate-model.py` | build script | batch | Python script; no Python precedent in this project; patterns come entirely from RESEARCH.md Code Examples (skl2onnx pattern) |

---

## Config File Changes Required

### `vite.config.ts`
**Analog:** `src/dashboard/index.html` rollupOptions.input entry (lines 16–19)
```typescript
// EXISTING:
rollupOptions: {
  input: {
    dashboard: resolve(__dirname, 'src/dashboard/index.html'),
  },
},

// PHASE 3 — add offscreen entry:
rollupOptions: {
  input: {
    dashboard: resolve(__dirname, 'src/dashboard/index.html'),
    offscreen: resolve(__dirname, 'src/offscreen/index.html'),  // NEW
  },
},
// Also add viteStaticCopy plugin (RESEARCH.md Code Examples pattern)
```

### `manifest.json`
**Analog:** `manifest.json` lines 36–57 (existing permissions and web_accessible_resources)
```json
// PHASE 3 additions:
{
  "permissions": ["storage", "tabs", "alarms", "contextMenus", "scripting", "activeTab", "offscreen"],
  "web_accessible_resources": [
    { "resources": ["src/dashboard/index.html"], "matches": ["<all_urls>"] },
    { "resources": ["src/offscreen/index.html"], "matches": ["<all_urls>"] },
    { "resources": ["ort/*.wasm", "ort/*.mjs"], "matches": ["<all_urls>"] },
    { "resources": ["assets/classifier.onnx"], "matches": ["<all_urls>"] }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  }
}
```

### `src/shared/constants.ts`
**Analog:** `src/shared/constants.ts` lines 1–9 (all constants follow same export const pattern)
```typescript
// EXISTING pattern:
export const ALARM_NAME = 'HIBERNATE_CHECK' as const
export const TIMEOUT_MS = 45 * 60 * 1000

// PHASE 3 — add after existing constants, same pattern:
export const AI_CONFIDENCE_THRESHOLD = 0.6
export const AI_COLD_START_MIN_SAMPLES = 50
export const AI_HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000    // 14 days
export const AI_WAKE_SIGNAL_WINDOW_MS = 5 * 60 * 1000            // 5-minute wake window
export const AI_BIAS_MAX = 1.0
export const AI_LEARNING_DAYS = 14                                // display countdown
export const VITAL_DOMAINS: readonly string[] = ['github.com', 'docs.google.com', 'notion.so', 'linear.app', 'figma.com']
export const DEAD_DOMAINS: readonly string[] = []                 // none preset; user-driven
```

---

## Metadata

**Analog search scope:** `src/background/`, `src/popup/`, `src/dashboard/`, `src/shared/`, `src/components/`, `src/content/`
**Files scanned:** 22 TypeScript/TSX source files + 4 config files
**Pattern extraction date:** 2026-05-11
