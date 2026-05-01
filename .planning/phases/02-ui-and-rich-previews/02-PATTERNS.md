# Phase 2: UI & Rich Previews - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 17 (new/modified)
**Analogs found:** 14 / 17

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/background/idb.ts` | utility | CRUD | `src/background/storage.ts` | role-match (same typed-wrapper shape, different backing store) |
| `src/background/thumbnail.ts` | service | request-response | `src/background/badge.ts` | role-match (async SW utility, no analog for canvas ops) |
| `src/background/index.ts` | service worker entrypoint | event-driven | itself (`src/background/index.ts`) | exact (modify-in-place) |
| `src/background/hibernation.ts` | service | CRUD | itself (`src/background/hibernation.ts`) | exact (modify-in-place) |
| `src/shared/types.ts` | model | — | itself (`src/shared/types.ts`) | exact (modify-in-place) |
| `src/shared/constants.ts` | config | — | itself (`src/shared/constants.ts`) | exact (modify-in-place) |
| `src/popup/App.tsx` | component | request-response | itself (`src/popup/App.tsx`) | exact (full redesign, patterns carry forward) |
| `src/dashboard/index.html` | config | — | `src/popup/index.html` | exact |
| `src/dashboard/main.tsx` | component | — | `src/popup/main.tsx` | exact |
| `src/dashboard/App.tsx` | component | request-response | `src/popup/App.tsx` | role-match |
| `src/dashboard/index.css` | config | — | `src/popup/index.css` | exact (copy verbatim) |
| `manifest.json` | config | — | itself (`manifest.json`) | exact (modify-in-place) |
| `vite.config.ts` | config | — | itself (`vite.config.ts`) | exact (modify-in-place) |
| `src/background/idb.test.ts` | test | — | `src/background/hibernation.test.ts` | role-match |
| `src/background/thumbnail.test.ts` | test | — | `src/background/index.test.ts` | role-match |
| `src/popup/App.test.tsx` | test | — | `src/background/index.test.ts` | role-match |
| `src/dashboard/App.test.tsx` | test | — | `src/background/index.test.ts` | role-match |
| `vitest.setup.ts` | config | — | itself (`vitest.setup.ts`) | exact (modify-in-place) |

---

## Pattern Assignments

### `src/background/idb.ts` (utility, CRUD)

**Analog:** `src/background/storage.ts` — same typed-wrapper shape (typed key → typed value, async helper functions). The backing store is IndexedDB via `idb` instead of `chrome.storage.local`.

**Module-level singleton pattern** — No direct analog exists in the codebase; pattern comes from RESEARCH.md Pattern 1. The `storage.ts` re-export style (one function per operation) IS the shape to copy.

**Imports pattern** — copy from `src/background/storage.ts` lines 1 (import shape), adapt for `idb`:
```typescript
import { openDB, type IDBPDatabase } from 'idb'
```

**Typed interface pattern** — copy from `src/shared/types.ts` lines 1-12 (interface + export functions shape):
```typescript
export interface ThumbnailRecord {
  tabId: number
  url: string
  dataUrl: string
  capturedAt: number
}

interface SmartHibernatorDB {
  thumbnails: {
    key: number
    value: ThumbnailRecord
  }
}
```

**Module-level cache + CRUD exports** (RESEARCH.md Pattern 1 — verbatim, no codebase analog):
```typescript
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

export async function putThumbnail(record: ThumbnailRecord): Promise<void> {
  const db = await getDb()
  await db.put('thumbnails', record)
}

export async function getThumbnail(tabId: number): Promise<ThumbnailRecord | undefined> {
  const db = await getDb()
  return db.get('thumbnails', tabId)
}

export async function deleteThumbnail(tabId: number): Promise<void> {
  const db = await getDb()
  await db.delete('thumbnails', tabId)
}

export async function getAllThumbnails(): Promise<ThumbnailRecord[]> {
  const db = await getDb()
  return db.getAll('thumbnails')
}
```

**Error handling pattern** — no try/catch at the helper level; callers wrap in try/catch (established pattern in `src/background/hibernation.ts` lines 59-63 and `src/background/index.ts` lines 54-60).

**Eviction logic** — add `pruneIfNeeded()` exported function after the CRUD helpers. Compute total size by summing `dataUrl.length` (base64 byte approximation × 0.75). Delete oldest entries by `capturedAt` until under 25 MB cap. Pattern: `getAllThumbnails()` → sort by `capturedAt` ascending → delete until total size < `25 * 1024 * 1024`.

---

### `src/background/thumbnail.ts` (service, request-response)

**Analog:** `src/background/badge.ts` — same pattern: async function, no class, single responsibility, exported named functions, no try/catch at definition (callers handle).

**Imports pattern** — copy badge.ts structure, replace with thumbnail dependencies:
```typescript
import { putThumbnail, pruneIfNeeded } from './idb'
```

**Core pattern** — OffscreenCanvas compression (RESEARCH.md Pattern 3 — no codebase analog for canvas work):
```typescript
export async function compressToWebP(
  pngDataUrl: string,
): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    const blob = await fetch(pngDataUrl).then((r) => r.blob())
    const img = await createImageBitmap(blob)

    const MAX_W = 800
    const MAX_H = 600
    const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    const webpBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
    if (webpBlob.size > 250 * 1024) {
      const smaller = await canvas.convertToBlob({ type: 'image/webp', quality: 0.4 })
      return blobToDataUrl(smaller)
    }
    return blobToDataUrl(webpBlob)
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function captureAndStore(tabId: number, url: string, windowId: number): Promise<void> {
  try {
    const pngDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    const dataUrl = await compressToWebP(pngDataUrl)
    if (dataUrl) {
      await putThumbnail({ tabId, url, dataUrl, capturedAt: Date.now() })
      await pruneIfNeeded()
    }
  } catch {
    // Tab closed between onUpdated and capture — silently continue
  }
}
```

**Error handling pattern** — copy from `src/background/hibernation.ts` lines 59-63:
```typescript
  } catch {
    // Tab closed or not discardable — ignore
  }
```

---

### `src/background/index.ts` (service worker entrypoint, event-driven — MODIFY)

**Analog:** itself. Add two new listeners following the established synchronous top-level listener registration pattern (lines 1-12, 46-60).

**New onUpdated listener** — insert after the existing `chrome.tabs.onActivated` listener (after line 52). Follow the same guard-early-return pattern as `isDiscardable`:

```typescript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.active) return
  if (!tab.url?.startsWith('http')) return
  captureAndStore(tabId, tab.url, tab.windowId).catch((err) =>
    console.error('[smart-hibernator] thumbnail capture failed', err)
  )
})
```

**Modified onRemoved listener** — extend existing handler (lines 54-60) to also call `deleteThumbnail(tabId)` from idb.ts. Keep the `chrome.storage.local.get` pattern unchanged; add the IDB call after:
```typescript
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('tab_meta', (result) => {
    const tab_meta = (result.tab_meta as Record<number, unknown>) || {}
    delete tab_meta[tabId]
    chrome.storage.local.set({ tab_meta })
  })
  deleteThumbnail(tabId).catch(() => {/* silently ignore */})
})
```

**onInstalled backfill pattern** — copy from lines 26-35 to also backfill `timeout_minutes` and `hibernation_events`:
```typescript
if (existing['timeout_minutes'] === undefined) defaults['timeout_minutes'] = 45
if (existing['hibernation_events'] === undefined) defaults['hibernation_events'] = []
```

**Alarm error pattern** — copy from line 42-44:
```typescript
.catch((err) => console.error('[smart-hibernator] alarm tick failed', err))
```

---

### `src/background/hibernation.ts` (service, CRUD — MODIFY)

**Analog:** itself. Three changes: (1) add `timeout_minutes` to the storage.get call, (2) replace `TIMEOUT_MS` usage with computed value, (3) add `timeoutMs` parameter to `isDiscardable`.

**Storage read pattern** — copy from lines 34-39, add `timeout_minutes`:
```typescript
const result = await chrome.storage.local.get([
  'hibernation_enabled',
  'tab_meta',
  'protected_tabs',
  'protected_domains',
  'timeout_minutes',    // NEW Phase 2
])
```

**Computed timeout** — add after line 42 (`const hibernationEnabled` line):
```typescript
const timeoutMs = ((result['timeout_minutes'] as number) ?? 45) * 60 * 1000
```

**isDiscardable signature change** — modify line 5-11, add `timeoutMs: number` parameter and remove `TIMEOUT_MS` import:
```typescript
export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number   // NEW — replaces TIMEOUT_MS constant
): boolean {
  // ... existing guards unchanged ...
  if (now - lastActive < timeoutMs) return false   // was: TIMEOUT_MS
```

**TIMEOUT_MS removal** — remove line 2 import of `TIMEOUT_MS` from constants. Keep `FORM_PROTECTION_MS` import. Keep `TIMEOUT_MS` in `constants.ts` as a fallback default (the `?? 45` default in `handleAlarmTick` covers runtime; TIMEOUT_MS may be kept for the test file which imports it directly).

**hibernation_events append** — in `handleAlarmTick`, after successful discard, push a `HibernationEvent` to storage:
```typescript
// After newDiscards++ in the discard loop:
await chrome.storage.local.get('hibernation_events').then(async (r) => {
  const events: HibernationEvent[] = (r['hibernation_events'] as HibernationEvent[]) ?? []
  events.push({ timestamp: Date.now(), tabId: tab.id!, url: tab.url! })
  // Keep only last 7 days of events
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  await chrome.storage.local.set({
    hibernation_events: events.filter((e) => e.timestamp > cutoff),
  })
})
```

---

### `src/shared/types.ts` (model — MODIFY)

**Analog:** itself. Add two new keys to `StorageSchema` and a new `HibernationEvent` interface.

**New interface** — insert before `StorageSchema` (after line 4):
```typescript
export interface HibernationEvent {
  timestamp: number   // unix ms
  tabId: number
  url: string
}
```

**StorageSchema extension** — add to lines 6-12:
```typescript
export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
  timeout_minutes: number              // NEW Phase 2 — default 45
  hibernation_events: HibernationEvent[]  // NEW Phase 2 — for 7-day chart
}
```

No other changes needed — `getStorage`/`setStorage` generics pick up new keys automatically.

---

### `src/shared/constants.ts` (config — MODIFY)

**Analog:** itself (lines 1-3).

Keep `TIMEOUT_MS` as a named constant (used by `hibernation.test.ts` line 4 import) but add a comment clarifying it is the default-only value:
```typescript
export const ALARM_NAME = 'HIBERNATE_CHECK' as const
export const TIMEOUT_MS = 45 * 60 * 1000        // 45 min — Phase 2: default only; runtime reads timeout_minutes from storage
export const FORM_PROTECTION_MS = 5 * 60 * 1000 // 5 minutes
export const DEFAULT_TIMEOUT_MINUTES = 45        // NEW — used by dashboard Settings default
export const RAM_PER_TAB_MB = 150               // NEW — estimated MB freed per hibernated tab
export const THUMBNAIL_MAX_SIZE_BYTES = 250 * 1024   // NEW — 250 KB WebP cap
export const IDB_SIZE_CAP_BYTES = 25 * 1024 * 1024  // NEW — 25 MB IDB cap
```

---

### `src/popup/App.tsx` (component, request-response — FULL REDESIGN)

**Analog:** itself. All existing patterns carry forward; new sections added below the protect toggle.

**Existing patterns to keep unchanged (lines 1-83):**
- `useState<PopupState>` shape (lines 17-24) — extend with `hibernatedTabs: HibernatedTabRow[]`
- `useEffect` storage read pattern (lines 26-50) — add `chrome.tabs.query({discarded: true})` call here
- `chrome.storage.onChanged` subscription with cleanup return (lines 54-83) — unchanged
- Handler function pattern `handleGlobalToggle`, `handleProtectToggle` (lines 85-133) — unchanged
- Button disabled / label compute pattern (lines 136-144) — unchanged
- JSX structure: `flex flex-col gap-4 bg-zinc-950` (line 147) — keep, add new sections

**New imports to add** (add to lines 1-5):
```typescript
import { ExternalLink, Globe, Loader2, Moon, RefreshCw } from 'lucide-react'
import { getThumbnail } from '../background/idb'
```

**New state shape** — extend `PopupState` interface:
```typescript
interface HibernatedTabRow {
  id: number
  title: string
  url: string
  domain: string
  favIconUrl: string | undefined
  dataUrl: string | undefined
}

interface PopupState {
  // ... existing fields ...
  hibernatedTabs: HibernatedTabRow[]
  wakingTabId: number | null
}
```

**Hibernated tab list load** — add inside `useEffect` after the existing storage read (after line 50):
```typescript
const discardedTabs = await chrome.tabs.query({ discarded: true })
const rows: HibernatedTabRow[] = await Promise.all(
  discardedTabs.map(async (tab) => {
    const record = tab.id ? await getThumbnail(tab.id) : undefined
    return {
      id: tab.id!,
      title: tab.title ?? 'Unknown Tab',
      url: tab.url ?? '',
      domain: tab.url ? new URL(tab.url).hostname : '',
      favIconUrl: tab.favIconUrl,
      dataUrl: record?.dataUrl,
    }
  })
)
setState((prev) => ({ ...prev, hibernatedTabs: rows }))
```

**Wake handler** — add after `handleProtectToggle` (after line 133):
```typescript
async function handleWakeTab(tabId: number) {
  setState((prev) => ({ ...prev, wakingTabId: tabId }))
  try {
    await chrome.tabs.update(tabId, { active: true })
    // Evict thumbnail — import deleteThumbnail from idb
    setState((prev) => ({
      ...prev,
      wakingTabId: null,
      hibernatedTabs: prev.hibernatedTabs.filter((t) => t.id !== tabId),
    }))
  } catch {
    setState((prev) => ({ ...prev, wakingTabId: null }))
  }
}
```

**Dashboard link handler** — copy `chrome.tabs.create` pattern from background index.ts:
```typescript
function handleOpenDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
}
```

**JSX — tab list section** (insert after protect toggle Separator, before count display):
```tsx
{/* Hibernated Tab List */}
<div className="flex flex-col overflow-y-auto max-h-[220px]">
  {state.hibernatedTabs.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-6 gap-1">
      <span className="text-sm font-normal text-zinc-50">No hibernated tabs</span>
      <span className="text-xs font-normal text-zinc-400">
        Tabs you hibernate will appear here.
      </span>
    </div>
  ) : (
    state.hibernatedTabs.map((tab) => (
      <div
        key={tab.id}
        className="flex items-center gap-2 min-h-16 py-2 border-b border-white/10 hover:bg-white/5"
      >
        {/* Thumbnail cell — State A or B */}
        <div className="w-20 h-12 rounded overflow-hidden shrink-0 bg-zinc-800">
          {tab.dataUrl ? (
            <img src={tab.dataUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-20 h-12 rounded bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-1">
              {tab.favIconUrl ? (
                <img src={tab.favIconUrl} className="w-4 h-4 rounded-sm" alt="" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span className="text-xs font-normal text-zinc-500 truncate max-w-[68px]">
                {tab.domain}
              </span>
            </div>
          )}
        </div>
        {/* Title + domain */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <span className="text-sm font-normal text-zinc-50 truncate">{tab.title}</span>
          <span className="text-xs font-normal text-zinc-400 truncate">{tab.domain}</span>
        </div>
        {/* Wake button */}
        <Button
          variant="outline"
          size="sm"
          disabled={state.wakingTabId === tab.id}
          onClick={() => handleWakeTab(tab.id)}
          className="h-8 px-3 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 active:bg-zinc-600 text-xs font-normal shrink-0"
        >
          {state.wakingTabId === tab.id ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            'Wake Tab'
          )}
        </Button>
      </div>
    ))
  )}
</div>
```

**JSX — dashboard footer link** (insert after count display, at end of return):
```tsx
{/* Dashboard link */}
<div className="flex items-center justify-center pt-2">
  <Button
    variant="ghost"
    size="sm"
    onClick={handleOpenDashboard}
    className="text-xs font-normal text-zinc-400 hover:text-zinc-50 gap-1"
  >
    Dashboard
    <ExternalLink className="w-3 h-3" />
  </Button>
</div>
```

**Count display update** — update the count text from `text-3xl` to `text-xl` (line 218 in current file):
```tsx
<span className="text-xl font-semibold text-amber-400 tabular-nums">
  {state.hibernatedCount}
</span>
```

---

### `src/dashboard/index.html` (config)

**Analog:** `src/popup/index.html` — copy verbatim, change `<title>` only.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Smart Hibernator — Dashboard</title>
    <link rel="stylesheet" href="./index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

---

### `src/dashboard/main.tsx` (component)

**Analog:** `src/popup/main.tsx` — copy verbatim, zero changes needed:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

---

### `src/dashboard/App.tsx` (component, request-response)

**Analog:** `src/popup/App.tsx` — same storage subscription pattern (lines 26-83), same `useState` + `useEffect` structure, same handler pattern. Extend for two-tab shell.

**Imports pattern** — copy popup App.tsx lines 1-5, replace UI imports:
```typescript
import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Slider } from '../components/ui/slider'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { HibernationEvent } from '../shared/types'
```

**State shape** — copy popup `useState<T>` pattern (lines 17-24):
```typescript
interface DashboardState {
  hibernatedCount: number
  hibernationEvents: HibernationEvent[]
  timeoutMinutes: number
  protectedDomains: string[]
  domainInput: string
  domainError: string
  isRefreshing: boolean
}
```

**Storage subscription pattern** — copy popup useEffect (lines 26-83) adapted for dashboard keys:
```typescript
useEffect(() => {
  chrome.storage.local.get(
    ['hibernated_count', 'hibernation_events', 'timeout_minutes', 'protected_domains'],
    (result) => {
      setState((prev) => ({
        ...prev,
        hibernatedCount: (result['hibernated_count'] as number) ?? 0,
        hibernationEvents: (result['hibernation_events'] as HibernationEvent[]) ?? [],
        timeoutMinutes: (result['timeout_minutes'] as number) ?? 45,
        protectedDomains: (result['protected_domains'] as string[]) ?? [],
      }))
    }
  )

  // Copy chrome.storage.onChanged pattern from popup App.tsx lines 54-83
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    const updates: Partial<DashboardState> = {}
    if ('hibernated_count' in changes)
      updates.hibernatedCount = changes['hibernated_count'].newValue as number
    if ('hibernation_events' in changes)
      updates.hibernationEvents = changes['hibernation_events'].newValue as HibernationEvent[]
    if ('timeout_minutes' in changes)
      updates.timeoutMinutes = changes['timeout_minutes'].newValue as number
    if ('protected_domains' in changes)
      updates.protectedDomains = changes['protected_domains'].newValue as string[]
    if (Object.keys(updates).length > 0)
      setState((prev) => ({ ...prev, ...updates }))
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}, [])
```

**Settings handlers** — copy popup `handleProtectToggle` pattern (lines 118-133) for domain add/remove:
```typescript
function handleAddDomain() {
  const domain = state.domainInput.trim().replace(/^https?:\/\//, '')
  if (!domain) return
  if (state.protectedDomains.includes(domain)) {
    setState((prev) => ({ ...prev, domainError: 'Domain already protected.' }))
    return
  }
  const updated = [...state.protectedDomains, domain]
  chrome.storage.local.set({ protected_domains: updated })
  setState((prev) => ({ ...prev, protectedDomains: updated, domainInput: '', domainError: '' }))
}

function handleRemoveDomain(domain: string) {
  const updated = state.protectedDomains.filter((d) => d !== domain)
  chrome.storage.local.set({ protected_domains: updated })
  setState((prev) => ({ ...prev, protectedDomains: updated }))
}
```

**Recharts chart data** — compute from `hibernation_events` (group by day, last 7 days):
```typescript
function buildChartData(events: HibernationEvent[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const counts: Record<string, number> = {}
  for (const e of events) {
    if (e.timestamp < cutoff) continue
    const day = days[new Date(e.timestamp).getDay()]
    counts[day] = (counts[day] ?? 0) + 1
  }
  return days.map((day) => ({ day, count: counts[day] ?? 0 }))
}
```

**JSX shell** (outer layout from UI-SPEC §11):
```tsx
return (
  <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans">
    <div className="max-w-3xl mx-auto px-8 py-8">
      <Tabs defaultValue="stats">
        <TabsList className="bg-zinc-900 border border-white/10 rounded-lg p-1 flex gap-1">
          <TabsTrigger value="stats" className="...">Stats</TabsTrigger>
          <TabsTrigger value="settings" className="...">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="stats">
          {/* Hero metric + chart */}
        </TabsContent>
        <TabsContent value="settings">
          {/* Slider + domain whitelist */}
        </TabsContent>
      </Tabs>
    </div>
  </div>
)
```

---

### `src/dashboard/index.css` (config)

**Analog:** `src/popup/index.css` — copy verbatim, no changes. Both pages use identical Tailwind/shadcn/Geist setup.

---

### `manifest.json` (config — MODIFY)

**Analog:** itself (lines 35-41 for permissions array, lines 1-48 overall).

**Add `activeTab` to permissions** (insert after line 39 `"scripting"`):
```json
"permissions": [
  "storage",
  "tabs",
  "alarms",
  "contextMenus",
  "scripting",
  "activeTab"
]
```

**Add `web_accessible_resources`** (new top-level key, insert after `"icons"` block):
```json
"web_accessible_resources": [
  {
    "resources": ["src/dashboard/index.html"],
    "matches": ["<all_urls>"]
  }
]
```

**Add `content_security_policy`** (new top-level key):
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
}
```

---

### `vite.config.ts` (config — MODIFY)

**Analog:** itself (lines 11-20). Add `rollupOptions.input` for the dashboard entry.

**Modified build section** — copy existing `build: { assetsInlineLimit: 0 }` (line 14), add `rollupOptions`:
```typescript
build: {
  assetsInlineLimit: 0,
  rollupOptions: {
    input: {
      dashboard: resolve(__dirname, 'src/dashboard/index.html'),
    },
  },
},
```

The `resolve` import already exists on line 8 (`import { resolve } from 'path'`). No new imports needed.

---

### `src/background/idb.test.ts` (test)

**Analog:** `src/background/hibernation.test.ts` — same structure: `describe` + `it` + `expect`, named imports from subject module, helper factories.

**Imports pattern** — copy from `hibernation.test.ts` lines 1-5:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { putThumbnail, getThumbnail, deleteThumbnail, getAllThumbnails } from './idb'
import type { ThumbnailRecord } from './idb'
// fake-indexeddb/auto is imported in vitest.setup.ts — no import needed here
```

**Helper factory pattern** — copy `makeTab()` pattern from `hibernation.test.ts` lines 9-27:
```typescript
function makeThumbnail(overrides: Partial<ThumbnailRecord> = {}): ThumbnailRecord {
  return {
    tabId: 1,
    url: 'https://example.com',
    dataUrl: 'data:image/webp;base64,ABC',
    capturedAt: Date.now(),
    ...overrides,
  }
}
```

**Test pattern** — copy `describe/it/expect` shape from `hibernation.test.ts` lines 29-95:
```typescript
describe('idb CRUD (FR-08)', () => {
  it('putThumbnail stores a record retrievable by getThumbnail', async () => {
    await putThumbnail(makeThumbnail({ tabId: 42 }))
    const result = await getThumbnail(42)
    expect(result?.tabId).toBe(42)
  })

  it('deleteThumbnail removes the entry', async () => {
    await putThumbnail(makeThumbnail({ tabId: 7 }))
    await deleteThumbnail(7)
    expect(await getThumbnail(7)).toBeUndefined()
  })
})
```

---

### `src/background/thumbnail.test.ts` (test)

**Analog:** `src/background/index.test.ts` — same `vi.mocked()` + `beforeEach` + `vi.clearAllMocks()` pattern (lines 1-19).

**Mock pattern** — copy from `index.test.ts` lines 12-19:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressToWebP } from './thumbnail'

describe('compressToWebP (FR-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when OffscreenCanvas is unavailable', async () => {
    // jsdom does not implement OffscreenCanvas — function should guard and return null
    const result = await compressToWebP('data:image/png;base64,ABC')
    expect(result).toBeNull()
  })
})
```

---

### `src/popup/App.test.tsx` and `src/dashboard/App.test.tsx` (tests)

**Analog:** `src/background/index.test.ts` — `describe/it/expect/vi.mocked()` pattern. React components additionally need `@testing-library/react`.

**Imports pattern** — copy from `index.test.ts` lines 1-7, add React Testing Library:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
```

**Chrome mock pattern** — copy `vi.mocked(chrome.storage.local.get).mockResolvedValue(...)` from `index.test.ts` lines 29-31.

**Wave 0 stub** — these are minimal stubs; each test file starts with one describe block and one passing test:
```typescript
describe('App (Wave 0 stub)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.storage.local.get).mockResolvedValue({})
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    render(<App />)
    expect(document.body).toBeTruthy()
  })
})
```

---

### `vitest.setup.ts` (config — MODIFY)

**Analog:** itself (lines 1-21). Add `fake-indexeddb/auto` import after existing setup.

**Add after line 21** (after the `Object.assign(global, ...)` call):
```typescript
// fake-indexeddb/auto installs global indexedDB, IDBKeyRange, etc. in jsdom scope
// Required for src/background/idb.test.ts (FR-08)
import 'fake-indexeddb/auto'
```

---

## Shared Patterns

### Chrome Storage Read (all new consumers)

**Source:** `src/popup/App.tsx` lines 33-50  
**Apply to:** `src/dashboard/App.tsx`, `src/background/hibernation.ts` (extend existing)

```typescript
chrome.storage.local.get(
  ['key1', 'key2'],
  (result) => {
    const value = (result['key1'] as ExpectedType) ?? defaultValue
    setState((prev) => ({ ...prev, value }))
  }
)
```

### chrome.storage.onChanged Subscription with Cleanup

**Source:** `src/popup/App.tsx` lines 54-83  
**Apply to:** `src/dashboard/App.tsx` — copy this pattern exactly, change only the watched keys

```typescript
const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
  const updates: Partial<StateType> = {}
  if ('key_name' in changes) {
    updates.fieldName = changes['key_name'].newValue as FieldType
  }
  if (Object.keys(updates).length > 0) {
    setState((prev) => ({ ...prev, ...updates }))
  }
}
chrome.storage.onChanged.addListener(listener)
return () => chrome.storage.onChanged.removeListener(listener)
```

### SW Listener Registration (top-level, synchronous)

**Source:** `src/background/index.ts` lines 12-13 and comment block lines 9-11  
**Apply to:** All new `chrome.tabs.onUpdated` listener in `index.ts`

```typescript
// CRITICAL: ALL listeners registered synchronously at module top level
// Do NOT move any listener registration inside async callbacks
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { ... })
```

### try/catch Silent-Continue Error Handling

**Source:** `src/background/hibernation.ts` lines 59-63  
**Apply to:** `thumbnail.ts` `captureAndStore()`, popup `handleWakeTab()`

```typescript
try {
  // ... async chrome API call
} catch {
  // Tab closed or action not possible — silently continue
}
```

### vi.mocked Chrome API Setup in Tests

**Source:** `src/background/index.test.ts` lines 12-19  
**Apply to:** All four new test files

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chrome.storage.local.get).mockResolvedValue({ /* keys */ })
  vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined)
})
```

### shadcn Button with Custom Classes (override defaults)

**Source:** `src/popup/App.tsx` lines 178-190  
**Apply to:** Wake Tab button, Add Domain button, Refresh Thumbnails button, Dashboard link

```tsx
<Button
  variant="outline"
  className="w-full min-h-11 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 active:bg-zinc-600 text-sm font-normal"
>
  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Icon className="w-4 h-4 mr-2" />}
  {label}
</Button>
```

### Switch with Amber Accent

**Source:** `src/popup/App.tsx` lines 168-172  
**Apply to:** Any new toggle in dashboard (if added)

```tsx
<Switch
  checked={value}
  onCheckedChange={handler}
  className="data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700"
/>
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/background/thumbnail.ts` (OffscreenCanvas section) | service | file-I/O | No canvas/image processing exists in the codebase; RESEARCH.md Pattern 3 is the only reference |
| `src/background/idb.ts` (openDB singleton) | utility | CRUD | No IndexedDB usage exists yet; RESEARCH.md Pattern 1 is the only reference |
| `src/dashboard/App.tsx` (Recharts chart) | component | transform | No charting exists; RESEARCH.md Pattern 6 is the only reference |

---

## Metadata

**Analog search scope:** `src/background/`, `src/popup/`, `src/shared/`, `src/components/ui/`, `src/lib/`, root config files  
**Files scanned:** 16  
**Analogs with exact match:** 8 (modify-in-place files use themselves as analog)  
**Analogs with role-match:** 6  
**Files with no codebase analog (RESEARCH.md patterns apply):** 3  
**Pattern extraction date:** 2026-05-01
