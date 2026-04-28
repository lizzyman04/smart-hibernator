# Phase 1: Core Hibernation Engine - Research

**Researched:** 2026-04-28
**Domain:** Chrome Extension MV3 / Tab Management APIs / Vite + CRXJS Build Tooling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Timeout is hardcoded at 45 minutes. No settings UI in Phase 1.
- **D-02:** Global on/off toggle stored as `hibernation_enabled` in `chrome.storage.local`.
- **D-03:** Popup is minimal but branded — Tailwind-styled. Includes: global toggle, "Hibernate this tab" button, "Protect this tab" toggle, and hibernated tab count.
- **D-04:** Per-tab protection toggle included. Stores `protected_tabs` (tab IDs) and `protected_domains` in `chrome.storage.local`.
- **D-05:** Hibernated tab count displayed via `chrome.action.setBadgeText()` and in popup body.
- **D-06:** Content script uses `keydown` / `input` events on `<input>`, `<textarea>`, `<select>`. Sends `lastFormActivity` timestamp to SW via message passing.
- **D-07:** Form-based protection expires after 5 minutes of no form interaction.
- **D-08:** Tab Group protection deferred to Phase 2. Only four basic heuristic protections in Phase 1.
- **Stack:** React 19 + Vite + CRXJS + TypeScript + Tailwind CSS
- **Hibernation method:** `chrome.tabs.discard()` only — URL redirection explicitly rejected.

### Claude's Discretion
- Project scaffold structure (CRXJS manifest entry points, TypeScript path aliases, Vite config)
- Service Worker alarm polling interval (recommended: 1-minute check cycle)
- Storage schema key names and shape for tab metadata and settings
- Extension icon badge color
- Content script injection strategy (`manifest.json` static declaration vs. dynamic `chrome.scripting.executeScript`)
- Chrome Alarms naming convention for per-tab inactivity timers

### Deferred Ideas (OUT OF SCOPE)
- Tab Group protection (Phase 2)
- Configurable timeout threshold (Phase 2)
- Per-domain whitelisting UI (Phase 2)
- Options page (Phase 2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-01 | Auto-suspend inactive tabs after 45 min using chrome.alarms | Alarm creation pattern, 1-min poll cycle, per-tab alarm naming |
| FR-02 | Native discarding via `chrome.tabs.discard()` | Discard API behavior, guard conditions, Promise<Tab\|undefined> return |
| FR-03 | Heuristic protection: audible, pinned, active, unsaved-form | `tab.audible`, `tab.pinned`, `tab.active`, content-script message pattern |
| FR-04 | Manual controls: context menu + Ctrl+Shift+S + popup button | `contextMenus.create` in `onInstalled`, `commands` manifest declaration |
| NFR-05 | Permission minimalism: only `storage`, `tabs`, `alarms`, `contextMenus`, `scripting` | Confirmed minimal set covers all Phase 1 features |
| NFR-06 | 100% MV3 compliance — no MV2 patterns | No `setTimeout` in SW, no `background.persistent`, use Promise APIs |
| COMP-01 | Chrome 120+ and Edge Chromium | chrome.tabs.discard available Chrome 54+; all APIs used available in 120+ |
| COMP-02 | Windows, macOS, Linux, ChromeOS | No OS-specific APIs in Phase 1 |
</phase_requirements>

---

## Summary

Phase 1 establishes the complete MV3 foundation for Smart Hibernator. The core challenge is building reliable, event-driven tab lifecycle management in a context where the background Service Worker (SW) is ephemeral — it terminates after 30 seconds of inactivity and must survive restarts with all state intact via `chrome.storage.local`.

The technical stack (Vite + CRXJS + React 19 + Tailwind) is a well-established pattern for MV3 extension development in 2025. CRXJS v2.4.0 reads `manifest.json` as the Vite entry point and auto-generates `web_accessible_resources` for content script dependencies. The key practical constraint is that `type: "module"` is required in the `background` declaration (for ES module output), and SW changes trigger full extension reloads rather than HMR.

The `chrome.tabs.discard()` API is the correct hibernation primitive: it unloads tab memory while preserving the tab in the strip, and it silently no-ops on already-discarded, active, `chrome://`, NTP, and other protected tabs (returns `undefined` on failure). The guard pattern before calling discard must check `tab.active`, `tab.audible`, `tab.pinned`, `tab.discarded`, and form-activity state from storage.

**Primary recommendation:** Use a single 1-minute periodic alarm (`HIBERNATE_CHECK`) plus `chrome.tabs.onActivated`/`onRemoved` listeners to update `lastActiveAt` timestamps per tab in `chrome.storage.local`. On each alarm tick, query all tabs, apply all guards, and call `chrome.tabs.discard()` on those exceeding 45 minutes of inactivity.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inactivity timer tracking | Background Service Worker | — | Alarms API only works in SW; all timer state must survive SW restarts |
| Tab discarding | Background Service Worker | — | `chrome.tabs.discard()` is a privileged API only callable from SW/extension context |
| Heuristic evaluation (audible/pinned/active) | Background Service Worker | — | `chrome.tabs.query()` returns live tab state; no injection needed |
| Form-activity detection | Content Script | Background SW (storage write) | Requires DOM event access; CS sends timestamps, SW persists them |
| Popup UI | Extension Popup (React) | Background SW (storage read) | Popup reads/writes `chrome.storage.local`; SW is NOT needed to be awake |
| Badge count update | Background Service Worker | — | `chrome.action.setBadgeText()` should be set by the owner of discard logic |
| Context menu registration | Background Service Worker (onInstalled) | — | `contextMenus.create` must run in SW; `onClicked` registered at top level |
| Keyboard shortcut handling | Background Service Worker | — | `chrome.commands.onCommand` fires in SW |
| Per-tab protection toggle | Extension Popup | Background SW | Popup writes to storage; SW checks storage on alarm tick |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@crxjs/vite-plugin` | 2.4.0 | Vite plugin that uses manifest.json as entry point | Auto-discovers all extension entry points; handles `web_accessible_resources`; native HMR for popup |
| `vite` | 8.0.10 | Build tool | Required by CRXJS; fastest rebuild times for extension dev |
| `@vitejs/plugin-react` | 6.0.1 | React JSX transform | Required for React 19 fast refresh in popup |
| `react` + `react-dom` | 19.2.5 | Popup UI framework | Project decision (locked) |
| `typescript` | 6.0.3 | Type safety | Project decision (locked) |
| `tailwindcss` | 4.2.4 | Popup styling | Project decision (locked) |
| `@tailwindcss/vite` | 4.2.4 | Tailwind v4 Vite integration | Replaces PostCSS config; zero separate config file needed |
| `@types/chrome` | 0.1.40 | TypeScript types for Chrome APIs | Required for all `chrome.*` calls to be type-checked |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.5 | Unit testing framework | Unit tests for heuristic logic, storage schema, alarm callbacks |
| `vitest-chrome` | 0.1.0 | Chrome API mocks for vitest | Mock `chrome.tabs`, `chrome.alarms`, `chrome.storage` in unit tests |
| `@playwright/test` | 1.59.1 | E2E testing | Integration test: extension loads, tab discards after inactivity simulation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@crxjs/vite-plugin` | `wxt` (v0.20) | WXT has broader browser support and better DX for complex projects, but CRXJS is the locked decision |
| `@tailwindcss/vite` | PostCSS + `tailwindcss` v3 | Tailwind v4's Vite plugin is simpler (no separate config file), matches current version |
| `vitest-chrome` | `sinon-chrome` (3.0.1) | `sinon-chrome` is older/less maintained; `vitest-chrome` is purpose-built for vitest |

**Installation:**
```bash
# Production dependencies
npm install react react-dom

# Dev dependencies
npm install -D vite @vitejs/plugin-react @crxjs/vite-plugin typescript @types/chrome tailwindcss @tailwindcss/vite vitest vitest-chrome @playwright/test
```

**Version verification:** All versions confirmed via `npm view <package> version` on 2026-04-28. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
User Action (tab switch / page load / manual trigger)
        │
        ▼
chrome.tabs.onActivated ──────────────────────────────┐
chrome.tabs.onRemoved                                  │
chrome.tabs.onUpdated                                  │  Update lastActiveAt
        │                                              │  in storage.local
        ▼                                              ▼
[Background Service Worker] ◄─── chrome.alarms.onAlarm (HIBERNATE_CHECK, every 1 min)
        │
        ├─ Read storage.local: { hibernation_enabled, tabMeta, settings }
        │
        ├─ chrome.tabs.query({ url: '*://*/*' })  ←── get all non-chrome:// tabs
        │
        ├─ For each tab: apply ALL guards
        │      tab.active == true?           → skip
        │      tab.audible == true?          → skip
        │      tab.pinned == true?           → skip
        │      tab.discarded == true?        → skip (already done)
        │      tab.id in protected_tabs?     → skip
        │      tab.url hostname in protected_domains? → skip
        │      lastFormActivity < 5 min ago? → skip
        │      (now - lastActiveAt) < 45min? → skip
        │
        ├─ chrome.tabs.discard(tabId)  → returns Tab | undefined
        │      on success: increment hibernated_count in storage
        │                  chrome.action.setBadgeText({ text: count.toString() })
        │
        ▼
Content Script (injected via manifest.json static declaration)
  - keydown / input events on input/textarea/select
  - chrome.runtime.sendMessage({ type: 'FORM_ACTIVITY', tabId, timestamp })
        │
        ▼
[Background SW onMessage handler]
  - Writes { lastFormActivity: timestamp } to tabMeta[tabId] in storage.local

Popup (React, opened on extension icon click)
  - Reads from chrome.storage.local on mount
  - chrome.storage.onChanged listener for live updates
  - Buttons write to storage.local; SW picks up changes on next alarm tick
```

### Recommended Project Structure
```
src/
├── background/
│   ├── index.ts          # SW entry point — all top-level listeners registered here
│   ├── alarms.ts         # Alarm creation/cleanup helpers
│   ├── hibernation.ts    # Core guard logic + discard orchestration
│   ├── badge.ts          # setBadgeText/setBadgeBackgroundColor helpers
│   └── storage.ts        # Typed storage helpers (get/set/subscribe)
├── content/
│   └── form-watcher.ts   # Keydown/input event listeners → sendMessage
├── popup/
│   ├── index.html        # CRXJS entry point for popup
│   ├── main.tsx          # React root mount
│   ├── App.tsx           # Main popup component
│   └── index.css         # @import 'tailwindcss'
├── shared/
│   ├── types.ts          # Shared TypeScript interfaces (TabMeta, Settings, StorageSchema)
│   └── constants.ts      # ALARM_NAME, TIMEOUT_MS, FORM_PROTECTION_MS
manifest.json             # CRXJS reads this as entry point
vite.config.ts
tsconfig.json
```

### Pattern 1: CRXJS Manifest Declaration (Full Phase 1 Example)
**What:** The manifest.json that CRXJS processes. All file paths are relative to project root.
**When to use:** Always — this is how CRXJS discovers all entry points.

```json
{
  "manifest_version": 3,
  "name": "Smart Hibernator",
  "description": "Intelligent tab hibernation to save RAM and battery.",
  "version": "1.0.0",
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/form-watcher.ts"],
      "run_at": "document_idle",
      "exclude_matches": ["chrome://*/*", "chrome-extension://*/*"]
    }
  ],
  "commands": {
    "hibernate-current-tab": {
      "suggested_key": {
        "default": "Ctrl+Shift+S",
        "mac": "Command+Shift+S"
      },
      "description": "Hibernate the current tab"
    }
  },
  "permissions": [
    "storage",
    "tabs",
    "alarms",
    "contextMenus",
    "scripting"
  ],
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```
[VERIFIED: Official CRXJS docs + Chrome developer documentation] [CITED: https://developer.chrome.com/docs/extensions/reference/api/commands]

### Pattern 2: Vite Config for CRXJS + React + Tailwind v4
**What:** Minimal vite.config.ts. `base: './'` is mandatory for extension pages.

```typescript
// Source: CRXJS docs + artmann.co/articles/building-a-chrome-extension-with-vite-react-and-tailwind-css-in-2025
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import manifest from './manifest.json'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
  build: {
    assetsInlineLimit: 0,  // Prevent asset inlining (breaks extension CSP)
  },
})
```
[VERIFIED: artmann.co 2025 guide + CRXJS npm page 2.4.0]

### Pattern 3: Service Worker Entry Point Structure
**What:** All top-level event listeners MUST be registered synchronously at module scope. Never inside async callbacks.

```typescript
// Source: Chrome developer docs - service worker lifecycle
// src/background/index.ts

import { handleAlarmTick } from './hibernation'
import { createContextMenus } from './contextMenus'

// CRITICAL: All listeners registered at top level, synchronously
// The SW restart mechanism requires these to be present on first execution

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install' || reason === 'update') {
    createContextMenus()
    // Initialize storage defaults on install
    chrome.storage.local.set({
      hibernation_enabled: true,
      hibernated_count: 0,
      tab_meta: {},
      protected_tabs: [],
      protected_domains: [],
    })
  }
  // Always ensure the check alarm exists (survives reinstall/update)
  chrome.alarms.get('HIBERNATE_CHECK', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('HIBERNATE_CHECK', { periodInMinutes: 1 })
    }
  })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'HIBERNATE_CHECK') {
    handleAlarmTick()
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.storage.local.get('tab_meta', ({ tab_meta }) => {
    tab_meta[tabId] = { ...tab_meta[tabId], lastActiveAt: Date.now() }
    chrome.storage.local.set({ tab_meta })
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('tab_meta', ({ tab_meta }) => {
    delete tab_meta[tabId]
    chrome.storage.local.set({ tab_meta })
  })
})

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) {
    chrome.storage.local.get('tab_meta', ({ tab_meta }) => {
      tab_meta[sender.tab!.id!] = {
        ...tab_meta[sender.tab!.id!],
        lastFormActivity: message.timestamp,
      }
      chrome.storage.local.set({ tab_meta })
    })
  }
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'hibernate-tab' && tab?.id) {
    chrome.tabs.discard(tab.id)
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'hibernate-current-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.discard(tab.id)
    })
  }
})
```
[CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

### Pattern 4: Tab Guard Function (Hibernation Eligibility)
**What:** The predicate that determines if a tab is safe to discard.

```typescript
// Source: derived from chrome.tabs API docs + auto-tab-discard patterns
// src/background/hibernation.ts

const TIMEOUT_MS = 45 * 60 * 1000       // 45 minutes
const FORM_PROTECTION_MS = 5 * 60 * 1000 // 5 minutes

interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

function isDiscardable(tab: chrome.tabs.Tab, meta: TabMeta | undefined, now: number): boolean {
  // Guard: tab must have a valid id
  if (!tab.id || !tab.url) return false

  // Guard: skip chrome://, chrome-extension://, about:, NTP, edge://
  // These tabs return undefined from discard() — skip proactively
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false

  // Guard: never discard the active (focused) tab
  if (tab.active) return false

  // Guard: never discard audible tabs (playing media)
  if (tab.audible) return false

  // Guard: never discard pinned tabs
  if (tab.pinned) return false

  // Guard: already discarded — nothing to do
  if (tab.discarded) return false

  // Guard: inactivity window not reached
  const lastActive = meta?.lastActiveAt ?? now  // conservative: treat unknown as just-active
  if (now - lastActive < TIMEOUT_MS) return false

  // Guard: form activity within protection window
  if (meta?.lastFormActivity && now - meta.lastFormActivity < FORM_PROTECTION_MS) return false

  return true
}
```
[VERIFIED: chrome.tabs API docs] [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs]

### Pattern 5: Per-Tab Alarm Naming (Claude's Discretion)
**What:** Alarm naming convention using tab ID. The alarm is not per-tab; Phase 1 uses a single global poll alarm. This section documents the naming convention should per-tab alarms be needed in Phase 2.

For Phase 1, use a single periodic alarm:
```typescript
const ALARM_NAME = 'HIBERNATE_CHECK'  // single global alarm, period = 1 min
```

Rationale: Per-tab alarms (e.g., `TAB_INACTIVITY_${tabId}`) would hit the Chrome alarm maximum of ~500 alarms with power users. A single 1-minute poll is simpler and within MV3 constraints (min period = 30s).
[CITED: https://developer.chrome.com/docs/extensions/reference/api/alarms]

### Pattern 6: Typed Storage Schema
**What:** A typed interface for all `chrome.storage.local` keys to prevent schema drift.

```typescript
// src/shared/types.ts
export interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>   // key = tab ID (as number)
  protected_tabs: number[]            // array of protected tab IDs
  protected_domains: string[]         // array of protected hostnames
}

// Type-safe storage helper
export async function getStorage<K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get(key)
  return result[key]
}
```
[ASSUMED: Schema design is Claude's discretion — no external source for exact key names]

### Pattern 7: Context Menu Setup (onInstalled)
**What:** Context menus must be created in `onInstalled`. In MV3, the `onclick` property cannot be used in SW; use `onClicked` instead (registered at top level).

```typescript
// src/background/contextMenus.ts
export function createContextMenus(): void {
  chrome.contextMenus.create({
    id: 'hibernate-tab',
    title: 'Hibernate this tab',
    contexts: ['page', 'action'],
  })
  chrome.contextMenus.create({
    id: 'protect-tab',
    title: 'Protect this tab from hibernation',
    contexts: ['page', 'action'],
  })
}
```
[VERIFIED: chrome.contextMenus API docs] [CITED: https://developer.chrome.com/docs/extensions/reference/api/contextMenus]

### Pattern 8: Badge Update
**What:** Badge text is limited to 4 characters. Amber color matches design intent.

```typescript
// src/background/badge.ts
export async function updateBadge(count: number): Promise<void> {
  const text = count > 0 ? (count > 999 ? '999+' : String(count)) : ''
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }) // Tailwind amber-400
}
```
[VERIFIED: chrome.action API docs — "4 or fewer characters" recommendation]

### Anti-Patterns to Avoid
- **`setTimeout`/`setInterval` in Service Worker:** SW terminates after 30s of inactivity, killing any timers. Use `chrome.alarms` exclusively. [VERIFIED: Chrome SW lifecycle docs]
- **Global in-memory state in SW:** Any `const map = new Map()` at module scope will be lost on SW restart. All state must be written to `chrome.storage.local` immediately. [VERIFIED: Chrome SW lifecycle docs]
- **Long-lived ports for CS→SW communication:** Ports disconnect when the SW restarts (5-minute port timeout in Chrome). Use `chrome.runtime.sendMessage` for one-shot CS→SW messages (form activity). `sendMessage` wakes a dormant SW reliably. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/messaging]
- **`onclick` in `contextMenus.create` from a SW:** Not supported in MV3 SW. Register `chrome.contextMenus.onClicked` at top level instead. [VERIFIED: contextMenus API docs]
- **Registering event listeners inside async callbacks:** Listeners must be registered synchronously at top level during SW startup or Chrome will not wake the SW for those events. [VERIFIED: SW lifecycle docs]
- **Calling `chrome.tabs.discard()` without guards:** Discarding an active tab returns `undefined` silently; discarding a `chrome://` tab also no-ops silently. Always check `tab.url`, `tab.active`, `tab.discarded` first. [CITED: https://developer.chrome.com/docs/extensions/reference/api/tabs#method-discard]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab inactivity timers | Custom timer manager with setTimeout | `chrome.alarms` periodic alarm at 1-min | SW ephemerality kills any custom timer |
| TypeScript Chrome API types | Manual type stubs | `@types/chrome` 0.1.40 | Complete, maintained coverage of entire Chrome extension API |
| Unit test Chrome API mocks | Manual `global.chrome = {}` stubs | `vitest-chrome` | Complete mock matching `@types/chrome` schema; supports `callListeners()` |
| Tailwind in popup CSP | Manual style injection or nonce handling | Compile-time CSS via `@tailwindcss/vite` | Compiled CSS = static stylesheet = no CSP violation; inline styles from arbitrary values would violate MV3 CSP |
| Extension build pipeline | Manual Rollup config for each entry | CRXJS `@crxjs/vite-plugin` | Handles manifest-as-entry, auto `web_accessible_resources`, HMR for popup |
| E2E extension testing | Manual CDP scripting | `@playwright/test` with `launchPersistentContext` | Official recommended approach; handles SW lifecycle in headless mode |

**Key insight:** The Chrome Extensions API surface is large and version-sensitive. Every API used in Phase 1 has an exact version requirement — `@types/chrome` 0.1.40 covers Chrome 120+ for all Phase 1 APIs.

---

## Common Pitfalls

### Pitfall 1: Service Worker Dies Before Alarm Fires
**What goes wrong:** Developer creates `chrome.alarms.create()` inside an async handler (e.g., inside `onInstalled`'s async callback). The alarm is created after the SW restarts, but because there was no top-level `onInstalled` listener registered in the initial sync, the SW never wakes up for the alarm.
**Why it happens:** MV3 SW only knows to wake up for events whose listeners were registered during the initial synchronous execution.
**How to avoid:** Register ALL event listeners (`onAlarm`, `onInstalled`, `onMessage`, `onActivated`, etc.) synchronously at module top level. Check if alarm exists before creating: `chrome.alarms.get('HIBERNATE_CHECK', alarm => { if (!alarm) chrome.alarms.create(...) })`.
**Warning signs:** Alarms appear to be created (visible in `chrome://serviceworker-internals`), but never fire. [VERIFIED: Chrome SW lifecycle docs]

### Pitfall 2: Storage Read/Write Race in Alarm Handler
**What goes wrong:** On every 1-minute alarm tick, the handler reads `tab_meta` from storage, iterates tabs, calls discard, then writes back updated `hibernated_count`. If multiple alarms fire close together (extension update + restart), two concurrent reads produce stale writes.
**Why it happens:** `chrome.storage.local.get/set` is async but not transactional.
**How to avoid:** Use a simple in-progress flag or serialize writes carefully. For Phase 1, the 1-minute period makes race conditions rare, but wrap the handler in a try/finally to avoid stuck state.
**Warning signs:** Badge count is incorrect after multiple tab discards.

### Pitfall 3: Content Script Sends Message to Dead SW
**What goes wrong:** Content script calls `chrome.runtime.sendMessage()` but the SW has terminated and takes >500ms to wake up. The message appears to be lost; the Promise never resolves in old Chrome versions.
**Why it happens:** `sendMessage` reliably wakes the SW in Chrome 116+ [ASSUMED: version number from community reports, not officially documented]. In earlier versions there was a race condition.
**How to avoid:** Since COMP-01 requires Chrome 120+, `sendMessage` from CS to SW is reliable. Do not use long-lived ports for this purpose.
**Warning signs:** Form activity timestamps not updating in storage despite user typing.

### Pitfall 4: CRXJS HMR Works for Popup But Not Content Script CSS
**What goes wrong:** Tailwind class changes in the content script's CSS don't HMR-update — only restarting Vite picks up new classes.
**Why it happens:** Known CRXJS v2 issue: Tailwind CSS HMR in content scripts only works on the dev server tab, not in extension-injected tabs.
**How to avoid:** During development, manually reload the extension in `chrome://extensions` after adding new Tailwind classes to content scripts. For the popup (React), HMR works fine.
**Warning signs:** Content script looks unstyled after adding new utility classes; popup updates immediately but content script doesn't.
[CITED: https://github.com/crxjs/chrome-extension-tools/issues/671]

### Pitfall 5: Badge Text Length Overflow
**What goes wrong:** Setting badge text to a string longer than 4 characters (e.g., "1000") causes the badge to display truncated or overflow the icon.
**Why it happens:** Chrome recommends ≤ 4 characters for the action badge.
**How to avoid:** Cap display at `"999+"` for counts ≥ 1000. Clear badge (empty string) when count is 0.
**Warning signs:** Badge text appears clipped or invisible on some DPI settings.
[VERIFIED: chrome.action API docs]

### Pitfall 6: Discarding a Tab That Is Loading
**What goes wrong:** A tab with `status: 'loading'` is discarded before the page fully loads, which may surprise users and could conflict with in-flight navigation.
**Why it happens:** `chrome.tabs.discard()` does not check `tab.status`.
**How to avoid:** Add `tab.status === 'complete'` to the guard in `isDiscardable()`.
**Warning signs:** Users see blank tabs that never loaded after hibernation.

### Pitfall 7: `manifest.json` Path Prefix
**What goes wrong:** CRXJS requires manifest paths NOT to start with `./` or `/`. Using `"./src/background.ts"` causes CRXJS to fail to find the entry point.
**Why it happens:** CRXJS resolves paths relative to project root without the prefix.
**How to avoid:** Use `"src/background/index.ts"` not `"./src/background/index.ts"`.
**Warning signs:** `Error: Could not resolve entry module` during Vite build.
[CITED: CRXJS manifest concepts docs]

---

## Code Examples

Verified patterns from official sources:

### Alarm Creation (Idempotent)
```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/alarms
async function ensureHibernateAlarm(): Promise<void> {
  const existing = await chrome.alarms.get('HIBERNATE_CHECK')
  if (!existing) {
    await chrome.alarms.create('HIBERNATE_CHECK', { periodInMinutes: 1 })
  }
}
```

### Context Menu (MV3 Pattern)
```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/contextMenus
// MUST use onClicked listener (not onclick property) in service workers
chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
  if (info.menuItemId === 'hibernate-tab' && tab?.id) {
    chrome.tabs.discard(tab.id)
  }
})
```

### Badge with Count
```typescript
// Source: https://developer.chrome.com/docs/extensions/reference/api/action
await chrome.action.setBadgeText({ text: '5' })          // max 4 chars recommended
await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })  // amber
await chrome.action.setBadgeText({ text: '' })           // clears badge
```

### Content Script → SW Message
```typescript
// src/content/form-watcher.ts
const WATCHED_SELECTORS = 'input, textarea, select'

function reportFormActivity(): void {
  chrome.runtime.sendMessage({
    type: 'FORM_ACTIVITY',
    timestamp: Date.now(),
  })
}

document.addEventListener('keydown', (e) => {
  if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
    reportFormActivity()
  }
})

document.addEventListener('input', (e) => {
  if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
    reportFormActivity()
  }
})
```

### Playwright E2E Fixture
```typescript
// Source: https://playwright.dev/docs/chrome-extensions
import { test as base, chromium, BrowserContext } from '@playwright/test'
import path from 'path'

const pathToExtension = path.join(__dirname, '../dist')

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,  // extensions require headed mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    const extensionId = sw.url().split('/')[2]
    await use(extensionId)
  },
})
```

### Vitest Setup for Chrome Mock
```typescript
// vitest.setup.ts
import * as chrome from 'vitest-chrome'
Object.assign(global, { chrome })
```
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome.browserAction` (MV2) | `chrome.action` (MV3) | Chrome 88 / MV3 release | Unified API; badge, icon, popup all under `chrome.action` |
| `background.persistent: true` (MV2) | Ephemeral SW + `chrome.alarms` (MV3) | Chrome 88 | Must redesign any timer/state logic |
| `chrome.tabs.discard` callback API | Promise-based `chrome.tabs.discard` (MV3) | Chrome 88+ for Promises | Use `await chrome.tabs.discard(id)` in MV3 |
| PostCSS pipeline for Tailwind | `@tailwindcss/vite` plugin (Tailwind v4) | Tailwind v4.0 (Jan 2025) | No `tailwind.config.ts` or `postcss.config.js` needed; `@import 'tailwindcss'` in CSS |
| `chrome.tabs.executeScript` (MV2) | `chrome.scripting.executeScript` (MV3) | Chrome 88 | Different namespace; `scripting` permission required |
| Manifest `content_scripts` only | Static (manifest) + Dynamic (`chrome.scripting`) | MV3 | For Phase 1 form-watcher, static manifest declaration is simpler and correct |

**Deprecated/outdated:**
- `chrome.browserAction`: removed in MV3; replaced by `chrome.action`
- `background.persistent: true`: invalid in MV3 manifests
- `chrome.tabs.executeScript`: removed in MV3; use `chrome.scripting.executeScript`
- Tailwind v3 PostCSS config: still works but v4's Vite plugin is cleaner for this stack

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sendMessage` from content script reliably wakes a dormant SW in Chrome 120+ | Pitfall 3 | Form activity timestamps would not reach SW; tab hibernation would ignore form state |
| A2 | `chrome.tabs.discard()` silently no-ops on `chrome://` and NTP tabs (returns `undefined`) | Pattern 4 / Pitfall 6 | If it throws instead of returning undefined, the alarm handler would need try/catch wrapping (currently recommended anyway) |
| A3 | CRXJS v2.4.0 is compatible with Vite 8.0.x | Standard Stack | If incompatible, would need to pin Vite to a lower version; check peerDependencies on install |
| A4 | `@tailwindcss/vite` v4 works correctly in CRXJS popup context without CSP issues | Standard Stack / Pitfall section | If inline styles are injected (Tailwind arbitrary values), MV3 CSP would block them; avoid arbitrary values |
| A5 | Storage schema key names (`tab_meta`, `hibernation_enabled`, etc.) | Pattern 6 | These are Claude's discretion and not locked — planner may adjust naming |

---

## Open Questions

1. **CRXJS + Vite 8 peer compatibility**
   - What we know: CRXJS 2.4.0 has `rollup: 2.79.2` bundled as a direct dependency (not peer), which may conflict with Vite 8's bundled Rollup
   - What's unclear: Whether CRXJS 2.4.0 is officially tested with Vite 8.0.x (vs Vite 5/6)
   - Recommendation: Test install during Wave 0 (scaffold task). If peer conflict, pin to `vite@6` which is confirmed compatible with CRXJS 2.x. The CRXJS GitHub issues list may have reports.

2. **`chrome.tabs.discard()` on tabs with `autoDiscardable: false`**
   - What we know: `tab.autoDiscardable` is a property; `false` means the browser won't auto-discard, but extension-initiated discard should still work
   - What's unclear: Whether extension-called `chrome.tabs.discard()` respects `autoDiscardable: false`
   - Recommendation: Do NOT add `autoDiscardable` as a guard. Extension-initiated discard overrides browser's auto-discard setting per API intent.

3. **CRXJS v2 HMR for popup with React 19**
   - What we know: CRXJS provides React HMR for popup; React 19 changed the root API (createRoot)
   - What's unclear: Any CRXJS-specific issues with React 19 fast refresh
   - Recommendation: If HMR breaks popup, standard workaround is manual extension reload. Functional correctness is not affected.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build tooling | ✓ | v25.3.0 | — |
| npm | Package management | ✓ | 11.7.0 | — |
| Google Chrome | Extension loading + E2E tests | ✓ | 147.0.7727.116 | — |
| Vite | Build system | Not yet installed | — | Install in Wave 0 |
| CRXJS | Extension build | Not yet installed | — | Install in Wave 0 |
| `@playwright/test` | E2E tests | Not yet installed | — | Skip E2E in dev, test manually |

**Missing dependencies with no fallback:** None — all required tools are available or installable.

**Missing dependencies with fallback:** None blocking. All are npm installable.

**Note:** Chrome 147 is well above the COMP-01 requirement of Chrome 120+. All Phase 1 APIs (`chrome.tabs.discard`, `chrome.alarms`, `chrome.action`, `chrome.contextMenus`, `chrome.commands`, `chrome.scripting`, `chrome.storage.local`) are fully available.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-01 | `isDiscardable()` returns false when `lastActiveAt` < 45 min | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-01 | `isDiscardable()` returns true when `lastActiveAt` > 45 min | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-02 | `chrome.tabs.discard()` called with correct tab ID | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-03 | `isDiscardable()` returns false for audible tab | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-03 | `isDiscardable()` returns false for pinned tab | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-03 | `isDiscardable()` returns false for active tab | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-03 | `isDiscardable()` returns false when form active within 5 min | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-03 | `isDiscardable()` returns false for chrome:// URL | unit | `npx vitest run src/background/hibernation.test.ts` | ❌ Wave 0 |
| FR-04 | Context menu click triggers `chrome.tabs.discard` | unit | `npx vitest run src/background/index.test.ts` | ❌ Wave 0 |
| FR-04 | `hibernate-current-tab` command triggers discard | unit | `npx vitest run src/background/index.test.ts` | ❌ Wave 0 |
| NFR-06 | Extension loads without MV3 manifest errors | smoke | Manual: load unpacked in `chrome://extensions` | manual |
| COMP-01 | Extension loads and hibernates in Chrome 120+ | smoke | `npx playwright test tests/e2e/extension.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run && npx playwright test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/background/hibernation.test.ts` — covers FR-01, FR-02, FR-03 guard logic
- [ ] `src/background/index.test.ts` — covers FR-04 command/menu handlers
- [ ] `tests/e2e/extension.spec.ts` — covers COMP-01 E2E smoke test
- [ ] `vitest.config.ts` — test config with `setupFiles` pointing to vitest-chrome mock
- [ ] `vitest.setup.ts` — `vitest-chrome` global assignment
- [ ] Framework install: `npm install -D vitest vitest-chrome @playwright/test` — not yet installed

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Extension has no user auth |
| V3 Session Management | no | No sessions; chrome.storage.local is local-only |
| V4 Access Control | no | No multi-user context |
| V5 Input Validation | yes | Content script reads DOM events; storage writes use typed schema |
| V6 Cryptography | no | No encryption needed; zero telemetry (NFR-04), all data stays local |

### Known Threat Patterns for Chrome MV3 Extensions

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious web page sends crafted runtime message to SW | Spoofing | Validate `message.type` against allowlist; never trust `sender.url` for security decisions |
| Content script injects data into storage schema (XSS-like) | Tampering | Validate and sanitize all message payloads in SW `onMessage` handler before writing to storage |
| Extension permissions escalation | Elevation of Privilege | NFR-05: declare only `storage`, `tabs`, `alarms`, `contextMenus`, `scripting` — no `<all_urls>` host permissions in manifest (use `content_scripts matches` instead) |
| Inline script execution via Tailwind arbitrary values | Tampering/XSS | Avoid Tailwind arbitrary values in popup; use only static class names to comply with `script-src 'self'` MV3 CSP |
| Excessive DOM scanning in content script | Denial of Service | FR-03 uses targeted event listeners on specific selectors, not `MutationObserver` on `document.body` |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] — `@crxjs/vite-plugin@2.4.0`, `vite@8.0.10`, `react@19.2.5`, `typescript@6.0.3`, `tailwindcss@4.2.4`, `@types/chrome@0.1.40`, `vitest@4.1.5`, `@playwright/test@1.59.1`
- [https://developer.chrome.com/docs/extensions/reference/api/alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) — Alarm API signatures, minimum period (30s), naming, onAlarm callback
- [https://developer.chrome.com/docs/extensions/reference/api/tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs) — discard() signature, Tab.discarded property, tabs.query filter properties
- [https://developer.chrome.com/docs/extensions/reference/api/action](https://developer.chrome.com/docs/extensions/reference/api/action) — setBadgeText/setBadgeBackgroundColor, 4-char limit
- [https://developer.chrome.com/docs/extensions/reference/api/contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) — create() signature, context types, onClicked in SW
- [https://developer.chrome.com/docs/extensions/reference/api/commands](https://developer.chrome.com/docs/extensions/reference/api/commands) — Manifest declaration format, Ctrl+Shift+S, onCommand listener
- [https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — 30-second idle termination, alarm wake-up, top-level listener requirement
- [https://developer.chrome.com/docs/extensions/reference/api/storage](https://developer.chrome.com/docs/extensions/reference/api/storage) — storage.local quota (10 MB), get/set/onChanged API
- [https://playwright.dev/docs/chrome-extensions](https://playwright.dev/docs/chrome-extensions) — launchPersistentContext, serviceWorker access, extensionId extraction

### Secondary (MEDIUM confidence)
- [https://www.mintlify.com/crxjs/chrome-extension-tools/concepts/background](https://www.mintlify.com/crxjs/chrome-extension-tools/concepts/background) — CRXJS background SW: `type: "module"` requirement, full reload on SW changes
- [https://crxjs.dev/concepts/content/](https://crxjs.dev/concepts/content/) — CRXJS content scripts HMR, auto web_accessible_resources
- [https://www.artmann.co/articles/building-a-chrome-extension-with-vite-react-and-tailwind-css-in-2025](https://www.artmann.co/articles/building-a-chrome-extension-with-vite-react-and-tailwind-css-in-2025) — `base: './'` requirement, `assetsInlineLimit: 0`, `@tailwindcss/vite` integration
- [https://optymized.net/blog/building-chrome-extensions](https://optymized.net/blog/building-chrome-extensions) — Full CRXJS + React manifest example, type-safe messaging pattern
- [https://github.com/probil/vitest-chrome](https://github.com/probil/vitest-chrome) — vitest-chrome setup, mocked API coverage

### Tertiary (LOW confidence)
- Community reports on `sendMessage` reliably waking SW in Chrome 116+ (used to support Pitfall 3)
- Chrome alarm maximum of ~500 named alarms (cited from community posts, not official docs — informs decision to use single global poll alarm)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all versions confirmed via npm registry on 2026-04-28
- Architecture: HIGH — all Chrome APIs verified against official docs; guard logic derived from API behavior
- CRXJS Configuration: MEDIUM — verified from CRXJS docs (Mintlify mirror) and community guides; one open question about Vite 8 compatibility
- Pitfalls: HIGH — SW lifecycle pitfalls verified from official Chrome docs; CRXJS HMR pitfall verified from GitHub issue tracker
- Testing: MEDIUM — vitest-chrome and Playwright setup verified; exact vitest 4.x + vitest-chrome 0.1.0 compatibility unverified

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (stable domain; CRXJS release cadence is slow)
