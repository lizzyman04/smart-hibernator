# Phase 2: UI & Rich Previews - Research

**Researched:** 2026-05-01
**Domain:** Chrome Extension MV3 / IndexedDB / Recharts / CRXJS Multi-Entry / Tab Screenshot
**Confidence:** HIGH (core APIs verified via official docs; library versions verified via npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Keep `chrome.tabs.discard()` from Phase 1 — no redirect to extension page. The popup becomes the preview surface for hibernated tabs.
- **D-02:** The popup must NOT navigate the tab to a placeholder URL. FR-09 "placeholder experience" is delivered through the popup UI, not tab navigation.
- **D-03:** Popup redesigned into a hibernated-tab manager with scrollable list (thumbnail, favicon, title, domain, Wake button per row).
- **D-04:** Phase 1 elements retained: global hibernation toggle, total hibernated count badge, "Hibernate this tab" button, "Protect this tab" toggle.
- **D-05:** "Dashboard →" button added to popup footer, opens `dashboard.html` via `chrome.tabs.create()`.
- **D-06:** Dashboard is a dedicated extension page at `src/dashboard/index.html`, opened via `chrome.runtime.getURL`.
- **D-07:** Dashboard has two tabs — Stats (Recharts bar chart, RAM estimate, hibernation count) and Settings (timeout slider, domain whitelist).
- **D-08:** Chart library: **Recharts** (React-native SVG, CSP-safe per D-08). No Chart.js or canvas-based library.
- **D-09:** Dashboard polls `chrome.storage.local` on mount + subscribes to `chrome.storage.onChanged`.
- **D-10:** Configurable timeout stored as `timeout_minutes: number` in `chrome.storage.local` (default: 45). Background reads from storage instead of hardcoded `TIMEOUT_MS`.
- **D-11:** Domain whitelist UI manages existing `protected_domains: string[]` key. Domain chips with remove (×) button.
- **D-12:** Tab Group protection NOT in Phase 2.
- **D-13:** Thumbnails captured in Service Worker on `chrome.tabs.onUpdated` when `status === 'complete'` AND the updated tab IS the active tab.
- **D-14:** "Refresh thumbnails" button on Stats tab re-captures on-demand (user-triggered).
- **D-15:** Thumbnails stored in IndexedDB (db: `smart-hibernator`, store: `thumbnails`) keyed by `tabId`. Value: `{ tabId, url, dataUrl: string (WebP base64), capturedAt: number }`.
- **D-16:** Eviction: delete on `chrome.tabs.onRemoved` and on wake. Cap: ~25 MB total. Auto-prune oldest if exceeded.
- **D-17:** WebP compression: `canvas.toDataURL('image/webp', 0.7)`, scale to max 800×600.
- **D-18:** RAM freed = 150 MB per hibernated tab (estimated). Always displayed with tilde prefix.

### Claude's Discretion
- IndexedDB library choice (native IDB API vs. `idb` wrapper from Jake Archibald)
- Dashboard route/tab state management (URL hash vs. React state)
- Popup list virtualization (only needed if hibernated count exceeds ~50 tabs; use simple CSS overflow for Phase 2)
- Exact Recharts chart types (BarChart vs. AreaChart for timeline)
- Thumbnail fallback rendering when no screenshot exists (favicon-centered colored card)

### Deferred Ideas (OUT OF SCOPE)
- Tab Group protection (FR-03) — deferred further; Phase 5 candidate
- Capture on tab switch (focus-flashing approach) — Phase 2+
- Per-tab RAM measurement — far future, requires native messaging
- URL-keyed thumbnail persistence across sessions — Phase 5
- Chrome Side Panel API — dedicated dashboard page preferred for Phase 2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-08 | Capture compressed WebP thumbnail (≤ 250 KB) before discarding | `captureVisibleTab` active-tab constraint; canvas scale + toDataURL pattern; IndexedDB storage with `idb` |
| FR-09 | Placeholder page: popup redesign with thumbnail, domain, Wake button per hibernated tab | `chrome.tabs.query({discarded:true})` cross-reference; wake via `chrome.tabs.update({active:true})`; D-01/D-02 no URL redirect |
| FR-10 | Dashboard with real-time RAM/CPU savings graphs | Recharts BarChart + ResponsiveContainer; `chrome.storage.onChanged` subscription; 150 MB/tab estimate |
</phase_requirements>

---

## Summary

Phase 2 extends the Phase 1 engine with three major additions: thumbnail capture stored in IndexedDB, a popup redesign that surfaces hibernated tabs with per-tab Wake controls, and a full-page dashboard with stats and settings.

The most consequential API constraint is that `chrome.tabs.captureVisibleTab()` can ONLY capture the currently active tab — this is a hard platform constraint, not a permission problem. The extension already has the `tabs` permission, but that does NOT satisfy `captureVisibleTab`; it requires `activeTab` OR `<all_urls>`. The manifest must add `activeTab`. Capture logic in the `onUpdated` handler must guard with `tab.active === true` before calling the API. D-13 already encodes this constraint correctly.

IndexedDB in the ephemeral MV3 Service Worker requires a module-level `openDB` promise cached in a `let db` variable. The `idb` library (8.0.3) is the recommended choice over the native IDB API — it is tiny (< 2 KB), promise-based, and widely used in extension codebases. On SW restart, the module re-executes and `openDB` reconnects; no cross-restart connection reuse issue exists because the module scope is fresh on each restart.

The CRXJS dashboard page registration has a specific gotcha: `build.rollupOptions.input` + `web_accessible_resources` in manifest.json is the correct pattern. Adding only `rollupOptions.input` without the manifest entry produces a built file that cannot be opened via `chrome.runtime.getURL`. The CRXJS plugin does NOT automatically add extra HTML pages to `web_accessible_resources`.

Recharts 3.8.1 uses SVG attribute-style inline styling internally. Extension_pages CSP in MV3 allows `style-src 'unsafe-inline'` (only `script-src` has the `unsafe-eval` restriction). For the dashboard page to render Recharts Tooltip correctly, the manifest must declare `"extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"`.

**Primary recommendation:** Use `idb` for IndexedDB, add `activeTab` permission + CSP entry to manifest, register dashboard via rollupOptions + web_accessible_resources, use Recharts BarChart with fixed `height={160}` (avoid ResponsiveContainer height-detection issues).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Thumbnail capture | Service Worker | — | Must call `captureVisibleTab` from SW; only callable from SW or extension pages, not content scripts |
| Thumbnail storage (write) | Service Worker | — | SW owns the write path immediately after capture |
| Thumbnail storage (read) | Popup / Dashboard page | — | UI pages open their own IDB connection to read thumbnails |
| Hibernated-tab list | Popup | — | `chrome.tabs.query({discarded:true})` + IndexedDB thumbnail read at popup open |
| Wake-tab action | Popup | — | Calls `chrome.tabs.update(tabId, {active:true})` directly from popup (same acceptable deviation as Phase 1 direct discard) |
| Stats display | Dashboard page | — | Reads `hibernated_count`, computes 150 MB * count; reads hibernation_events for chart |
| Settings persistence | Dashboard page | Service Worker | Dashboard writes `timeout_minutes` / `protected_domains`; SW reads them on next alarm tick |
| Alarm recreation on timeout change | Service Worker | — | SW listens `chrome.storage.onChanged` for `timeout_minutes`; no alarm period change needed (alarm ticks every 1 min; timeout is a read-side value used in `isDiscardable`) |
| IndexedDB eviction | Service Worker | — | SW deletes thumbnail entry in `onRemoved` and on successful wake |

---

## Standard Stack

### Core (New in Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `idb` | 8.0.3 | IndexedDB wrapper | Promise-based, tiny (< 2 KB gzip), Jake Archibald's canonical solution; no raw IDB callback hell |
| `recharts` | 3.8.1 | SVG charts for Stats tab | React-native SVG (no canvas), CSP-safe SVG output, React 19 peer compat confirmed |
| `fake-indexeddb` | 6.2.5 | IndexedDB in-memory mock for tests | Pure JS IDB implementation; use `fake-indexeddb/auto` in vitest setup |

**Version verification:** [VERIFIED: npm registry 2026-05-01]
- `idb@8.0.3` — current stable
- `recharts@3.8.1` — current stable; peer deps include `react ^19.0.0` confirmed
- `fake-indexeddb@6.2.5` — current stable; updated Nov 2025

### Supporting (shadcn New Components)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-tabs` | 1.1.13 | Tabs primitive (Stats/Settings) | Dashboard tab bar |
| `@radix-ui/react-slider` | 1.3.6 | Slider primitive (timeout control) | Settings timeout slider |
| `@radix-ui/react-scroll-area` | 1.2.10 | Custom scrollbar (popup list) | Popup hibernated-tab list |
| shadcn `input` component | via shadcn CLI | Domain whitelist text input | Settings domain add row |

**Version verification:** [VERIFIED: npm registry 2026-05-01]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `idb` | Native IDB API | Native API requires verbose callback/event chains; `idb` is < 2 KB and identical behavior |
| `idb` | `localforage` | localforage is heavier, auto-selects storage driver; not needed when IndexedDB is the only target |
| `recharts` | `chart.js` | Chart.js uses canvas + inline styles that violate MV3 CSP script-src; recharts uses pure SVG |
| URL hash routing | React `useState` | Hash routing adds complexity; two-tab dashboard needs only `useState` |

**Installation:**
```bash
npm install idb recharts react-is
npm install -D fake-indexeddb
npx shadcn add slider tabs input scroll-area
```

Note: `recharts` requires `react-is@19.2.5` as a peer dependency — already available in the project.

---

## Architecture Patterns

### System Architecture Diagram

```
chrome.tabs.onUpdated (status='complete')
         │
         ▼
    tab.active? ──No──► skip (cannot captureVisibleTab)
         │
        Yes
         ▼
  captureVisibleTab()
         │
         ▼
  canvas scale → 800×600
         │
         ▼
  toDataURL('image/webp', 0.7)
         │
         ▼
  IDB put(thumbnails, {tabId, url, dataUrl, capturedAt})
         │
         ▼
  check totalSize > 25 MB? ──Yes──► prune oldest entries
         │
        No
         ▼
       done

─────────────────────────────────────────────────────

Popup open
     │
     ▼
chrome.tabs.query({discarded:true})
     │
     ▼  for each hibernated tab
  IDB get(thumbnails, tabId)
     │
     ├──found──► render <img src={dataUrl}>
     └──miss──► render fallback card (favicon + domain)
     │
     ▼
  "Wake Tab" click
     │
     ▼
chrome.tabs.update(tabId, {active:true})  ← auto-reloads discarded tab
     │
     ▼
IDB delete(thumbnails, tabId)             ← evict thumbnail on wake

─────────────────────────────────────────────────────

Dashboard (Stats tab)
     │
     ▼
chrome.storage.local.get(['hibernated_count', 'hibernation_events'])
     │
     ▼
heroMetric = hibernated_count * 150 MB
chartData  = group hibernation_events by day (last 7 days)
     │
     ▼
<BarChart> via Recharts

─────────────────────────────────────────────────────

Dashboard (Settings tab)
     │
     ▼
  Slider onValueCommit ──► chrome.storage.local.set({timeout_minutes})
  Add Domain btn ──────── ► update protected_domains array in storage
  Remove chip ──────────── ► update protected_domains array in storage
     │
     ▼
chrome.storage.onChanged ──► SW reads new timeout_minutes on next alarm tick
   (no alarm recreation needed — timeout is read-side, alarm period stays 1 min)
```

### Recommended Project Structure

```
src/
├── background/
│   ├── index.ts             # Add onUpdated thumbnail listener + onRemoved eviction
│   ├── hibernation.ts       # Replace TIMEOUT_MS read with getStorage('timeout_minutes')
│   ├── thumbnail.ts         # NEW: captureAndStore(), evictThumbnail()
│   └── idb.ts               # NEW: openDB singleton, CRUD helpers
├── dashboard/
│   ├── index.html           # NEW: dashboard entry point
│   ├── index.css            # NEW: copy of popup/index.css (same @imports)
│   ├── main.tsx             # NEW: ReactDOM.createRoot
│   └── App.tsx              # NEW: Stats + Settings tab shell
├── popup/
│   └── App.tsx              # MODIFY: add hibernated tab list, Wake button, Dashboard link
└── shared/
    ├── types.ts             # MODIFY: add timeout_minutes, hibernation_events to StorageSchema
    └── constants.ts         # MODIFY: keep TIMEOUT_MS as fallback default only
```

### Pattern 1: IndexedDB Module-Level Singleton (idb)

**What:** Cache the `openDB` promise at module level so each SW restart reconnects once, not per-operation.
**When to use:** All IDB operations in `src/background/idb.ts`.

```typescript
// src/background/idb.ts
// Source: idb npm package v8 + Jake Archibald pattern
import { openDB, type IDBPDatabase } from 'idb'

interface ThumbnailRecord {
  tabId: number
  url: string
  dataUrl: string
  capturedAt: number
}

interface SmartHibernatorDB {
  thumbnails: {
    key: number        // tabId
    value: ThumbnailRecord
  }
}

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

**Why module-level:** When the SW restarts, the module re-executes and `dbPromise` is reset to `null`, forcing a fresh `openDB` call. Within a single SW lifetime, all operations share one connection. [VERIFIED: idb GitHub README pattern + npm package 8.0.3]

### Pattern 2: captureVisibleTab With Active-Tab Guard

**What:** Check `tab.active` before calling `captureVisibleTab`. If the tab is not active, skip silently.
**When to use:** `chrome.tabs.onUpdated` listener in `src/background/index.ts`.

```typescript
// Source: chrome.tabs API docs (developer.chrome.com/docs/extensions/reference/api/tabs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only capture when page has finished loading AND the tab is currently active
  if (changeInfo.status !== 'complete') return
  if (!tab.active) return
  if (!tab.url?.startsWith('http')) return   // skip chrome:// and extension pages

  try {
    // captureVisibleTab requires activeTab OR <all_urls> permission
    // "tabs" permission alone is NOT sufficient — see PITFALL 1
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    })

    // Scale and convert to WebP in an OffscreenCanvas (available in SW context)
    const compressed = await compressToWebP(dataUrl, tab.url ?? '')
    if (compressed) {
      await putThumbnail({
        tabId,
        url: tab.url ?? '',
        dataUrl: compressed,
        capturedAt: Date.now(),
      })
    }
  } catch {
    // Tab closed between onUpdated and capture — silently continue
  }
})
```

### Pattern 3: WebP Compression via OffscreenCanvas

**What:** Service Workers cannot create `<canvas>` DOM elements, but MV3 SWs have access to `OffscreenCanvas`. Use it to scale and encode.
**When to use:** Inside `src/background/thumbnail.ts`.

```typescript
// Source: MDN OffscreenCanvas docs + captureVisibleTab returns PNG data URL
export async function compressToWebP(
  pngDataUrl: string,
  url: string
): Promise<string | null> {
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
      // Re-encode at lower quality if still too large
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
```

**Key insight:** Use `OffscreenCanvas.convertToBlob()` rather than `canvas.toDataURL()` — `OffscreenCanvas` does not have `toDataURL`. [ASSUMED — OffscreenCanvas API shape; verify during implementation with `typeof OffscreenCanvas`]

### Pattern 4: Waking a Discarded Tab

**What:** `chrome.tabs.update(tabId, { active: true })` is sufficient to wake a discarded tab. Chrome automatically reloads the tab content upon activation.
**When to use:** Wake button click handler in popup.

```typescript
// Source: chrome.tabs API docs (developer.chrome.com/docs/extensions/reference/api/tabs#method-update)
// "A discarded tab's content is reloaded the next time it is activated."
// No separate chrome.tabs.reload() call is needed.
async function handleWakeTab(tabId: number) {
  try {
    await chrome.tabs.update(tabId, { active: true })
    await deleteThumbnail(tabId)   // evict thumbnail on wake
  } catch {
    // Tab was closed between list render and button click — ignore
  }
}
```

[VERIFIED: chrome.tabs API docs — "Its content is reloaded the next time it is activated."]

### Pattern 5: Dashboard Entry Point Registration (CRXJS + manifest)

**What:** Registering a new HTML page in CRXJS 2.x requires BOTH `rollupOptions.input` AND `web_accessible_resources` in `manifest.json`.
**When to use:** Whenever adding any extension page that isn't the popup or options_page.

```typescript
// vite.config.ts — add to existing config
import { resolve } from 'path'

export default defineConfig({
  // ... existing plugins
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'src/dashboard/index.html'),
      },
    },
  },
})
```

```json
// manifest.json — add web_accessible_resources
{
  "web_accessible_resources": [
    {
      "resources": ["src/dashboard/index.html"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  }
}
```

```typescript
// Popup: open dashboard
chrome.tabs.create({
  url: chrome.runtime.getURL('src/dashboard/index.html')
})
```

[VERIFIED: CRXJS docs at crxjs.dev/concepts/pages/ — "place them in Vite config under build.rollupOptions.input"; VERIFIED via GitHub discussion #730 for web_accessible_resources requirement]

### Pattern 6: Recharts BarChart (Fixed Height, No ResponsiveContainer Height Issues)

**What:** Use `ResponsiveContainer` with `width="100%"` and fixed `height={160}`. Do NOT rely on responsive height when the container has no intrinsic height.
**When to use:** Timeline chart in Stats tab.

```tsx
// Source: Recharts docs recharts.org + CSP investigation
import {
  BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const chartData = [
  { day: 'Mon', count: 3 },
  // ... last 7 days
]

<div className="bg-zinc-900 rounded-xl p-6 border border-white/10">
  <h2 className="text-xl font-semibold text-zinc-50 mb-4">Last 7 Days</h2>
  <ResponsiveContainer width="100%" height={160}>
    <BarChart data={chartData}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
      <XAxis
        dataKey="day"
        tick={{ fill: '#A1A1AA', fontSize: 12 }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        contentStyle={{
          background: '#18181B',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
        }}
        labelStyle={{ color: '#FAFAFA', fontSize: '12px' }}
        itemStyle={{ color: '#A1A1AA', fontSize: '12px' }}
        formatter={(value: number) => [`${value} tabs`, 'Hibernated']}
      />
      <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

**CSP note on Tooltip:** The `contentStyle` prop injects inline styles via the Tooltip HTML element. MV3 extension_pages allow `style-src 'unsafe-inline'`, so this is safe once the manifest CSP entry is added (Pattern 5). [VERIFIED: MV3 CSP docs — `style-src` restrictions do NOT apply; only `script-src unsafe-eval` is blocked]

### Pattern 7: Timeout Read in Service Worker (No Alarm Recreation)

**What:** The alarm period stays at 1 minute. `timeout_minutes` is a read-side value consumed only by `isDiscardable`. No alarm recreation is needed when the user changes the timeout.
**When to use:** `src/background/hibernation.ts` alarm tick.

```typescript
// Modify handleAlarmTick() to include timeout_minutes in the storage.get call
const result = await chrome.storage.local.get([
  'hibernation_enabled',
  'tab_meta',
  'protected_tabs',
  'protected_domains',
  'timeout_minutes',    // NEW in Phase 2
])

const timeoutMs =
  ((result['timeout_minutes'] as number) ?? 45) * 60 * 1000

// Pass timeoutMs to isDiscardable instead of importing TIMEOUT_MS constant
if (!isDiscardable(tab, meta, now, protectedTabs, protectedDomains, timeoutMs)) continue
```

`isDiscardable` signature change:
```typescript
export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number   // NEW parameter
): boolean
```

### Anti-Patterns to Avoid

- **Calling captureVisibleTab on a non-active tab:** Returns "Could not capture tab: Tab not found or tab not active." Always guard with `tab.active === true`. [VERIFIED: chrome.tabs API docs]
- **Using `chrome.tabs.reload()` to wake a discarded tab:** This creates a fresh page load without preserving scroll / session state. Use `chrome.tabs.update({active: true})` only — Chrome handles the reload. [VERIFIED: chrome.tabs API docs]
- **Opening IDB connection per-operation without caching:** Causes multiple upgrade transactions, potential `InvalidStateError`. Cache the `openDB` promise at module level. [VERIFIED: idb npm pattern]
- **Assuming `tabs` permission covers captureVisibleTab:** It does NOT. Requires `activeTab` or `<all_urls>`. Add `"activeTab"` to manifest permissions array. [VERIFIED: chrome.tabs API docs]
- **Using `canvas.toDataURL()` in Service Worker:** `<canvas>` is a DOM element unavailable in SW. Use `OffscreenCanvas.convertToBlob()` instead. [ASSUMED — verify at implementation]
- **Using `<all_urls>` host permission:** Adds a scary "Read and change all your data on all websites" installation warning. Use `activeTab` only (no installation warning, temporary grant). [VERIFIED: chrome.tabs.captureVisibleTab docs + activeTab permission docs]
- **ResponsiveContainer with no fixed height parent:** ResponsiveContainer width-detection works, but height detection requires a parent with a defined height. Always pass explicit `height={N}` to ResponsiveContainer or the chart renders at 0px. [CITED: recharts/recharts GitHub issues #1545, #3688]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB promise layer | Custom IDB wrapper class | `idb` (v8) | IDB's raw event/request API has 15+ gotchas (version conflicts, blocked upgrades, transaction auto-commit). Jake Archibald's library handles all of them. |
| SVG charts | Custom D3 / SVG rendering | Recharts BarChart | D3 in an extension requires complex CSP allowances; Recharts outputs pure SVG with React, CSP-safe. |
| Custom scrollbar styling | CSS `::-webkit-scrollbar` hacks | shadcn ScrollArea (Radix UI) | Cross-platform scrollbar styling is unreliable; ScrollArea is composable and theme-aware. |
| Thumbnail size management | Manual base64 length counting | `OffscreenCanvas.convertToBlob()` quality adjustment | `toDataURL` quality param doesn't guarantee byte size; `convertToBlob` with a size check + quality retry loop is the reliable pattern. |

**Key insight:** IndexedDB's raw API was designed before Promises existed. Every IDB operation uses `IDBRequest` events that must be wired to resolve/reject a Promise manually. The `idb` library is 1.19 KB brotli'd and handles this completely — there is no reason to hand-roll it.

---

## Common Pitfalls

### Pitfall 1: `tabs` Permission Does Not Enable `captureVisibleTab`
**What goes wrong:** Developer adds `captureVisibleTab` call and assumes the existing `tabs` permission covers it. Chrome throws `"Could not capture tab: The extension requires 'activeTab' or <all_urls> permission."` at runtime.
**Why it happens:** `tabs` permission grants access to sensitive Tab properties (`url`, `title`, etc.) but NOT screenshot capture. These are distinct permission scopes.
**How to avoid:** Add `"activeTab"` to `permissions` array in `manifest.json`. Use `activeTab`, not `<all_urls>` (avoids scary CWS permission warning).
**Warning signs:** Runtime error in Service Worker console on first page load after `onUpdated` fires.

### Pitfall 2: captureVisibleTab Silently Skips Inactive Tabs
**What goes wrong:** Capture code fires in `onUpdated` for background tabs finishing load; Chrome returns an error "Tab not active" instead of the screenshot.
**Why it happens:** `captureVisibleTab` is hard-constrained to the active tab of the specified window. It cannot capture background tabs regardless of permission.
**How to avoid:** Guard with `if (!tab.active) return` before calling `captureVisibleTab`.
**Warning signs:** Intermittent empty thumbnail results for tabs loaded in background (e.g., link opened with Ctrl+click).

### Pitfall 3: IDB Transaction Auto-Commit Breaks Multi-Step Operations
**What goes wrong:** Opening a transaction, doing an async operation unrelated to IDB (e.g., `await fetch()`), then trying to use the same transaction — `InvalidStateError: The transaction has finished`.
**Why it happens:** IDB transactions auto-commit once the event loop empties and no more requests are queued.
**How to avoid:** Keep each IDB transaction atomic (put/get only IDB operations between `tx = db.transaction(...)` and use). Never `await` non-IDB work inside a transaction. With `idb`'s helper methods (`db.put()`, `db.get()`), each call implicitly creates its own transaction, which is safe.
**Warning signs:** `InvalidStateError` in SW console during thumbnail storage operations.

### Pitfall 4: OffscreenCanvas Not Available in All Contexts
**What goes wrong:** `OffscreenCanvas` is used in the popup page (renderer context) where it's available, but this is inconsistent with the SW context.
**Why it happens:** OffscreenCanvas IS available in MV3 Service Workers in Chrome (Chrome 69+), but the global check `typeof OffscreenCanvas !== 'undefined'` should be present as defensive code.
**How to avoid:** Add `if (typeof OffscreenCanvas === 'undefined') return null` guard at the top of `compressToWebP`.
**Warning signs:** `ReferenceError: OffscreenCanvas is not defined` in SW console.

### Pitfall 5: Recharts Tooltip Inline Styles Blocked Without CSP Entry
**What goes wrong:** Recharts renders fine but Tooltip popup is invisible or throws a CSP violation in the console.
**Why it happens:** Recharts Tooltip is an HTML element that uses `contentStyle` prop values as inline `style` attributes. Without `style-src 'unsafe-inline'` in manifest CSP, these are blocked.
**How to avoid:** Add `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'" }` to manifest.json. [VERIFIED: MV3 CSP docs — style-src is NOT restricted in extension_pages beyond minimum policy]
**Warning signs:** Recharts chart renders but Tooltip has no background/border styling.

### Pitfall 6: Dashboard rollupOptions.input Without web_accessible_resources
**What goes wrong:** `src/dashboard/index.html` is built to `dist/` but `chrome.runtime.getURL('src/dashboard/index.html')` fails or opens a blank page.
**Why it happens:** CRXJS does NOT auto-add `rollupOptions.input` pages to `web_accessible_resources`. The browser blocks access to extension files not declared in `web_accessible_resources`.
**How to avoid:** Both entries are required: (1) `rollupOptions.input` for the build, (2) `web_accessible_resources` in `manifest.json` for runtime access.
**Warning signs:** `chrome.tabs.create({ url: chrome.runtime.getURL('...') })` opens a blank tab or shows extension blocked page.

### Pitfall 7: StorageSchema Missing New Keys Causes Type Errors
**What goes wrong:** `timeout_minutes` and `hibernation_events` are not in `StorageSchema` — existing `getStorage`/`setStorage` helpers reject unknown keys at TypeScript compile time.
**Why it happens:** `StorageSchema` is a discriminated union; the typed helpers enforce keys.
**How to avoid:** Add `timeout_minutes: number` and `hibernation_events: HibernationEvent[]` to `StorageSchema` in `src/shared/types.ts` before implementing any consumer. Define `HibernationEvent` interface alongside.
**Warning signs:** TypeScript error `Argument of type '"timeout_minutes"' is not assignable to parameter of type 'StorageKey'`.

### Pitfall 8: Alarm Recreation Is NOT Needed for Timeout Changes
**What goes wrong:** Developer recreates the 1-minute alarm with a new `periodInMinutes` when the user changes the timeout value.
**Why it happens:** Confusion between the alarm's tick period (always 1 min) and the hibernation timeout threshold (which is a read-side storage value consumed by `isDiscardable`).
**How to avoid:** The alarm always fires every 1 minute. `timeout_minutes` only affects the `isDiscardable` check inside `handleAlarmTick`. No alarm management code changes are needed.
**Warning signs:** Unnecessary `chrome.alarms.clear()` + `chrome.alarms.create()` calls in storage change listener.

---

## Code Examples

### Popup: Query Hibernated Tabs

```typescript
// Source: chrome.tabs API docs — tab.discarded property
// Cross-reference discarded tabs with IndexedDB thumbnails
async function loadHibernatedTabs() {
  const tabs = await chrome.tabs.query({ discarded: true })
  const thumbnailMap = new Map<number, string>()

  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return
      const record = await getThumbnail(tab.id)
      if (record) thumbnailMap.set(tab.id, record.dataUrl)
    })
  )

  return tabs.map((tab) => ({
    id: tab.id!,
    title: tab.title ?? 'Unknown Tab',
    url: tab.url ?? '',
    domain: tab.url ? new URL(tab.url).hostname : '',
    favIconUrl: tab.favIconUrl,
    dataUrl: tab.id ? thumbnailMap.get(tab.id) : undefined,
  }))
}
```

### StorageSchema Extension

```typescript
// src/shared/types.ts — add to existing file
export interface HibernationEvent {
  timestamp: number   // unix ms
  tabId: number
  url: string
}

export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
  timeout_minutes: number           // NEW — Phase 2
  hibernation_events: HibernationEvent[]  // NEW — Phase 2 (for 7-day chart)
}
```

### Settings: Timeout Slider with Debounced Storage Write

```tsx
// Source: shadcn Slider docs + Radix UI Slider onValueCommit
import { Slider } from '@/components/ui/slider'
import { useState } from 'react'

function TimeoutSlider({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial)

  function handleCommit(vals: number[]) {
    // onValueCommit fires only when the user releases the thumb
    chrome.storage.local.set({ timeout_minutes: vals[0] })
  }

  return (
    <div className="flex items-center gap-4">
      <Slider
        min={5}
        max={240}
        step={5}
        value={[value]}
        onValueChange={(vals) => setValue(vals[0])}   // live display
        onValueCommit={handleCommit}                   // storage write on release
        className="flex-1"
      />
      <span className="text-sm font-semibold text-zinc-50 w-24 text-right tabular-nums">
        {value} minutes
      </span>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `canvas.toDataURL()` for screenshots | `OffscreenCanvas.convertToBlob()` in SW | Chrome 69 (OffscreenCanvas) | Service Workers have no DOM; must use OffscreenCanvas |
| Background pages (MV2) | Ephemeral Service Workers (MV3) | Chrome 88 | All SW state must be in chrome.storage or IDB; no globals survive restarts |
| `chrome.extension.getURL()` | `chrome.runtime.getURL()` | MV3 migration | Old API deprecated; use `chrome.runtime.getURL()` |
| URL-redirect suspension | `chrome.tabs.discard()` | Chrome 54 (tabs.discard GA) | Native discard preserves tab strip; no URL history pollution |

**Deprecated/outdated:**
- `db.js` (mentioned in Phase 1 STACK.md): Outdated wrapper, last release 2015. Use `idb` instead.
- `canvas.toDataURL()` in Service Worker: DOM unavailable. Use `OffscreenCanvas.convertToBlob()`.
- `chrome.extension.getURL()`: Deprecated. Use `chrome.runtime.getURL()`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `OffscreenCanvas` is available in MV3 Service Worker and supports `convertToBlob({ type: 'image/webp' })` | Pattern 3 | If not available, must fall back to content-script-based capture or abandon SW-side encoding; add defensive guard |
| A2 | `FileReader` is available in SW context for Blob→dataURL conversion | Pattern 3 | If not, use `Response.text()` with blob URL instead; verify with `typeof FileReader` in SW |
| A3 | Recharts `contentStyle` Tooltip inline styles are the ONLY inline-style source in Recharts SVG output | Pitfall 5 | If Recharts injects inline styles on SVG elements too, additional CSP tuning needed |
| A4 | `hibernation_events` storage key can hold 7 days of data without approaching the `chrome.storage.local` 10 MB limit | StorageSchema pattern | At 100 events/day × 7 days = 700 events × ~100 bytes = 70 KB — well within limit, but should be confirmed |

---

## Open Questions

1. **OffscreenCanvas WebP support in MV3 SW**
   - What we know: OffscreenCanvas is specified to support `convertToBlob` with MIME types. Chrome's implementation includes WebP.
   - What's unclear: Whether the specific Chrome version range (120+) reliably supports `'image/webp'` in `convertToBlob`.
   - Recommendation: Add a `try/catch` fallback that re-tries with `'image/png'` if WebP conversion fails.

2. **IDB connection behavior across popup + SW concurrently**
   - What we know: IndexedDB is designed for concurrent access from multiple sources in the same origin (extension pages + SW share the extension origin).
   - What's unclear: Whether simultaneous writes (SW captures thumbnail) and reads (popup opens and reads thumbnails) require transaction isolation care.
   - Recommendation: Use separate short-lived transactions per operation (idb default behavior). No coordination code needed for this simple schema.

3. **`chrome.tabs.query({discarded: true})` completeness**
   - What we know: This is the correct API call to list discarded tabs.
   - What's unclear: Whether `hibernated_count` in storage and the length of `chrome.tabs.query({discarded: true})` can ever diverge (e.g., user manually restores a tab by clicking it in the tab strip, without the extension knowing).
   - Recommendation: The popup should use `chrome.tabs.query({discarded: true})` as the authoritative source of hibernated tabs. `hibernated_count` remains the badge/stat counter and may be a superset (all-time, not current count). Phase 2 popup should clearly display current hibernated count from query, not from storage key.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | ✓ | (project already running) | — |
| npm registry | idb, recharts install | ✓ | (verified at research time) | — |
| OffscreenCanvas in Chrome SW | Thumbnail compression | ✓ (Chrome 69+, project targets 120+) | Chrome 120+ | PNG fallback (larger, acceptable) |
| IndexedDB | Thumbnail storage | ✓ (MV3 SW has IDB access) | — | N/A — no viable fallback; required by D-15 |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + jsdom |
| Config file | `vitest.config.ts` (already present) |
| Setup file | `vitest.setup.ts` (already present — extend with `fake-indexeddb/auto`) |
| Quick run command | `npm test` (= `vitest run`) |
| Full suite command | `npm test && npm run test:e2e` |

### IndexedDB Test Setup

Add to `vitest.setup.ts`:
```typescript
// Add AFTER existing vitest-chrome setup
import 'fake-indexeddb/auto'
// fake-indexeddb/auto installs global indexedDB, IDBKeyRange, etc. in jsdom scope
// fake-indexeddb v6.2.5 requires structuredClone — jsdom 26 provides it natively
```

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-08 | `putThumbnail` stores record and `getThumbnail` retrieves it | unit | `vitest run src/background/idb.test.ts` | ❌ Wave 0 |
| FR-08 | `deleteThumbnail` removes entry on `onRemoved` | unit | `vitest run src/background/idb.test.ts` | ❌ Wave 0 |
| FR-08 | `compressToWebP` returns a base64 string under 250 KB (mocked captureVisibleTab) | unit | `vitest run src/background/thumbnail.test.ts` | ❌ Wave 0 |
| FR-08 | Auto-prune evicts oldest entries when total exceeds 25 MB | unit | `vitest run src/background/idb.test.ts` | ❌ Wave 0 |
| FR-09 | Popup renders hibernated-tab list from `chrome.tabs.query({discarded:true})` | unit (React) | `vitest run src/popup/App.test.tsx` | ❌ Wave 0 |
| FR-09 | Wake button calls `chrome.tabs.update(tabId, {active:true})` | unit (React) | `vitest run src/popup/App.test.tsx` | ❌ Wave 0 |
| FR-09 | Thumbnail cell shows fallback card when no IndexedDB entry exists | unit (React) | `vitest run src/popup/App.test.tsx` | ❌ Wave 0 |
| FR-10 | Stats tab computes `~{N} MB` from `hibernated_count * 150` | unit (React) | `vitest run src/dashboard/App.test.tsx` | ❌ Wave 0 |
| FR-10 | Settings tab writes `timeout_minutes` on slider commit | unit (React) | `vitest run src/dashboard/App.test.tsx` | ❌ Wave 0 |
| FR-10 | Settings tab adds/removes entries from `protected_domains` | unit (React) | `vitest run src/dashboard/App.test.tsx` | ❌ Wave 0 |
| D-10 | `handleAlarmTick` reads `timeout_minutes` from storage; default 45 applies when key missing | unit | `vitest run src/background/hibernation.test.ts` | ✅ (extend existing) |

**E2E (Playwright — manual-only for Phase 2 until test harness updated):**
- Dashboard opens in new tab when "Dashboard" button clicked
- Discarded tab reloads when Wake Tab button clicked
- Thumbnail appears for a captured tab

### Chrome Extension Testing Constraints

**Vitest (unit) — what works:**
- Pure logic: `isDiscardable`, thumbnail compression math, StorageSchema type guards
- React component rendering: popup list, dashboard Stats/Settings UI — with `@testing-library/react`
- IndexedDB operations: with `fake-indexeddb/auto` shim
- Chrome API calls: with `vitest-chrome` mocks + manual stubs (established pattern from Phase 1)

**Vitest (unit) — what does NOT work:**
- `chrome.tabs.captureVisibleTab()` — no DOM/renderer; must be integration-tested manually or skipped
- `OffscreenCanvas` — jsdom does not implement it; thumbnail compression tests must mock `compressToWebP`
- Multi-tab cross-origin behavior (popup ↔ SW ↔ IDB concurrency) — requires real browser

**Playwright (E2E):**
- Requires `npx playwright install chromium` + loading unpacked extension
- Can test end-to-end wake behavior, dashboard navigation, thumbnail display
- Currently used in project (`tests/e2e/`) but Phase 1 tests are likely smoke tests only

### Sampling Rate

- **Per task commit:** `npm test` (unit suite, ~15–30s)
- **Per wave merge:** `npm test` — all unit tests green
- **Phase gate:** Full suite (unit + E2E) green before `/gsd-verify-work`

### Wave 0 Gaps

New test files needed before implementation waves begin:

- [ ] `src/background/idb.test.ts` — covers FR-08 (IDB CRUD, eviction)
- [ ] `src/background/thumbnail.test.ts` — covers FR-08 (compression, skip inactive tab)
- [ ] `src/popup/App.test.tsx` — covers FR-09 (tab list render, Wake button, fallback card)
- [ ] `src/dashboard/App.test.tsx` — covers FR-10 (Stats metric, Settings slider, domain chips)
- [ ] Extend `vitest.setup.ts` with `import 'fake-indexeddb/auto'`
- [ ] Extend `vitest.setup.ts` with `@testing-library/react` if not already present

Install command for test deps:
```bash
npm install -D @testing-library/react @testing-library/jest-dom fake-indexeddb
```

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Validate domain input (non-empty, not duplicate, strip leading `https://` if user pastes URL) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Domain whitelist injection (user adds malformed string) | Tampering | Normalize input: trim whitespace, strip protocol, reject empty string |
| Thumbnail data URL XSS via `dangerouslySetInnerHTML` | Tampering | Use `<img src={dataUrl}>` — React's JSX escaping prevents injection |
| Overly broad `web_accessible_resources` `matches` | Elevation of privilege | `matches: ["<all_urls>"]` is required for extension pages opened from SW; acceptable per MV3 pattern |
| `style-src 'unsafe-inline'` in extension_pages CSP | Information disclosure | Scope-limited to extension pages only (not content_scripts); acceptable for dashboard Tooltip rendering |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab] — activeTab/all_urls requirement confirmed; active-tab-only constraint confirmed; 2 calls/sec rate limit
- [VERIFIED: developer.chrome.com/docs/extensions/reference/api/tabs#method-update] — discarded tab auto-reloads on activation; no separate reload call needed
- [VERIFIED: npm registry — idb@8.0.3, recharts@3.8.1, fake-indexeddb@6.2.5, @radix-ui/react-tabs@1.1.13, @radix-ui/react-slider@1.3.6, @radix-ui/react-scroll-area@1.2.10] — current versions 2026-05-01
- [VERIFIED: developer.chrome.com/docs/extensions/reference/manifest/content-security-policy] — MV3 extension_pages CSP minimum enforces script-src only; style-src 'unsafe-inline' is permitted
- [VERIFIED: crxjs.dev/concepts/pages/] — extra HTML pages go in rollupOptions.input for build
- [VERIFIED: github.com/crxjs/chrome-extension-tools/discussions/730] — web_accessible_resources required in manifest for runtime access

### Secondary (MEDIUM confidence)

- [CITED: recharts.org docs + GitHub issues #1545, #3688] — ResponsiveContainer height=fixed pattern; Tooltip uses HTML inline styles
- [CITED: github.com/jakearchibald/idb README] — module-level openDB promise pattern for service workers
- [CITED: developer.chrome.com/docs/extensions/develop/concepts/activeTab] — activeTab vs tabs permission distinction
- [CITED: mdn: HTMLCanvasElement.toDataURL] — WebP quality parameter behavior

### Tertiary (LOW confidence)

- [ASSUMED: A1] — OffscreenCanvas.convertToBlob with 'image/webp' in MV3 SW — needs runtime verification
- [ASSUMED: A2] — FileReader availability in SW — needs runtime verification
- [ASSUMED: A3] — Recharts SVG body does not inject additional inline styles beyond Tooltip — needs runtime CSP check during dev

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry 2026-05-01
- captureVisibleTab behavior: HIGH — verified via official Chrome docs
- Wake-tab behavior: HIGH — verified via official Chrome tabs API docs
- IndexedDB / idb pattern: HIGH — verified via official package docs and GitHub
- CRXJS multi-entry: HIGH — verified via official CRXJS docs + GitHub discussion
- Recharts CSP safety: MEDIUM — style-src restriction verified; Tooltip inline styles assumed (see A3)
- OffscreenCanvas in SW: MEDIUM — specified by web platform, Chrome 120+ target; convertToBlob WebP unverified at runtime

**Research date:** 2026-05-01
**Valid until:** 2026-07-01 (stable APIs; CRXJS beta status warrants re-check if upgrading beyond 2.4.0)
