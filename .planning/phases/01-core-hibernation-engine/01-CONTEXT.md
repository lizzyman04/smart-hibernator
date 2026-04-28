# Phase 1: Core Hibernation Engine - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers a fully functional MV3 Chrome extension foundation:
- Project scaffold (Vite + React 19 + CRXJS + TypeScript + Tailwind CSS)
- Background Service Worker with alarm-based inactivity tracking (fixed 45 min)
- Native tab discarding via `chrome.tabs.discard()`
- Heuristic protection: audible, pinned, active/focused, unsaved-form tabs
- Content script for form-activity detection
- Minimal branded popup: global toggle + hibernate-this-tab + protect-this-tab + hibernated count
- Extension icon badge showing hibernated tab count
- Right-click context menu + Ctrl+Shift+S keyboard shortcut for manual hibernation

Tab Group protection and all configurable settings (timeout threshold, per-domain rules) are explicitly deferred to Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Inactivity Timeout
- **D-01:** Timeout is hardcoded at **45 minutes** in Phase 1. No settings UI, no user-configurable threshold. Settings deferred entirely to Phase 2.
- **D-02:** A **global on/off toggle** is included in Phase 1. Boolean stored as `hibernation_enabled` in `chrome.storage.local`. When disabled, no tabs are discarded regardless of inactivity.

### Popup UI
- **D-03:** Popup is **minimal but branded** — clean Tailwind-styled UI with the extension's visual identity. Includes: global on/off toggle, "Hibernate this tab" button, "Protect this tab" toggle, and hibernated tab count. No dashboard, no graphs, no thumbnails (those belong to Phase 2).
- **D-04:** **Per-tab protection toggle** is included in Phase 1. Stores a whitelist of protected tab IDs and/or domains in `chrome.storage.local` (key: `protected_tabs`, `protected_domains`). User can toggle protection for the currently active tab from the popup.
- **D-05:** **Hibernated tab count** is displayed as a badge on the extension icon via `chrome.action.setBadgeText()`, and also shown inside the popup body. Badge updates whenever a tab is discarded or restored.

### Unsaved Form Detection
- **D-06:** Content script uses an **input-activity heuristic**: listens for `keydown` and `input` events on `<input>`, `<textarea>`, and `<select>` elements. If any interaction is detected, a `lastFormActivity` timestamp is sent to the Service Worker via message passing.
- **D-07:** Form-based protection **expires after 5 minutes** of no form field interaction. After 5 minutes of silence, the tab becomes eligible for hibernation again (subject to the 45-min inactivity timeout).

### Tab Group Protection
- **D-08:** Tab Group protection is **deferred to Phase 2**. Phase 1 implements only the four basic heuristic protections: audible/playing media, pinned, active/focused, and unsaved-form-input. The `tabGroups` API is not required in Phase 1.

### Claude's Discretion
- Project scaffold structure (CRXJS manifest entry points, TypeScript path aliases, Vite config)
- Service Worker alarm polling interval (recommended: 1-minute check cycle)
- Storage schema key names and shape for tab metadata and settings
- Extension icon badge color
- Content script injection strategy (`manifest.json content_scripts` declaration vs. dynamic `chrome.scripting.executeScript`)
- Chrome Alarms naming convention for per-tab inactivity timers

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/REQUIREMENTS.md` — Full functional and non-functional requirements; Phase 1 requirements are FR-01, FR-02, FR-03, FR-04, NFR-05, NFR-06, COMP-01, COMP-02
- `.planning/ROADMAP.md` — Phase goals, success criteria, and phase boundaries
- `.planning/PROJECT.md` — Strategic objectives, core pillars (privacy, reliability, intelligence, aesthetics)

### Architecture & Stack Research
- `.planning/research/ARCHITECTURE.md` — Service Worker centric architecture, component boundaries, data flow, anti-patterns to avoid (no setTimeout in SW, use MutationObserver sparingly)
- `.planning/research/STACK.md` — Technology stack decisions, recommended libraries (db.js for IndexedDB, Alarms API, Scripting API)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield project. Phase 1 establishes all foundational patterns.

### Established Patterns
- None yet — Phase 1 decisions above define the patterns all subsequent phases will inherit.

### Integration Points
- Service Worker → Content Script: message passing for form activity timestamps
- Service Worker → Popup: `chrome.storage.onChanged` listener for real-time badge/count updates
- Service Worker → Chrome APIs: `chrome.tabs`, `chrome.alarms`, `chrome.action`, `chrome.contextMenus`, `chrome.commands`

</code_context>

<specifics>
## Specific Ideas

- The extension should feel like a spiritual successor to The Great Suspender — familiar to power users of that extension
- Badge should be visible at a glance; consider amber/orange color to signal "hibernating tabs present"
- The Ctrl+Shift+S shortcut must be declared in `commands` in manifest.json (not just a popup button)
- `chrome.tabs.discard()` is the only supported hibernation method — URL redirection is explicitly rejected (see STACK.md)

</specifics>

<deferred>
## Deferred Ideas

- **Tab Group protection** — FR-03 lists this as a protection condition; deferred to Phase 2 (requires `tabGroups` API and UI to manage which groups are protected)
- **Configurable timeout threshold** — FR-01 default 45 min; user-configurable timeout UI deferred to Phase 2 settings dashboard
- **Per-domain whitelisting UI** — Per-tab protection included in Phase 1 popup, but a full domain whitelist management UI belongs in Phase 2
- **Options page** — Dedicated extension options page deferred to Phase 2

</deferred>

---

*Phase: 01-core-hibernation-engine*
*Context gathered: 2026-04-28*
