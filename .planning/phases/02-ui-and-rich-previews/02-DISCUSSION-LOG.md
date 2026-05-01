# Phase 2: UI & Rich Previews - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 02-ui-and-rich-previews
**Areas discussed:** Placeholder page architecture, Dashboard: location & scope, Deferred Phase 1 settings, Thumbnail capture timing & storage

---

## Placeholder Page Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to extension page | Navigate tab to chrome-extension://ID/placeholder.html before hibernating (Great Suspender approach). Shows custom thumbnail + Wake UI in the tab slot. Tab not truly discarded. | |
| Native discard + popup thumbnail view | Keep chrome.tabs.discard() from Phase 1. Popup becomes the preview surface showing thumbnails and Wake buttons. True zero-memory discard. | ✓ |
| Hybrid: redirect then discard | Navigate to placeholder.html then call chrome.tabs.discard() on it. Complex; placeholder must detect and handle its own discarded-reload cycle. | |

**User's choice:** Native discard + popup thumbnail view
**Notes:** FR-09's "placeholder experience" is re-interpreted as being delivered through the popup rather than in the tab slot itself. Keeps the Phase 1 architectural decision intact. Architect noted that chrome.tabs.discard() produces a truly unloaded tab — no HTML can be injected into it.

---

## Popup UX (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Scrollable list of hibernated tabs | Popup shows list of all hibernated tabs with thumbnail, favicon, title, Wake button per row. | ✓ |
| Keep minimal popup + open dashboard page | Popup stays Phase 1 minimal; "View hibernated tabs" button opens a full dashboard page. | |
| You decide | Claude picks approach. | |

**User's choice:** Scrollable list of hibernated tabs
**Notes:** Popup becomes a lightweight tab manager. Phase 1 elements (global toggle, hibernate button, protect toggle, badge count) are retained alongside the new list.

---

## Dashboard: Location & Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated full-page dashboard | chrome-extension://ID/dashboard.html opened via popup button. Full width, scrollable, two-tab layout. | ✓ |
| Chrome Side Panel (chrome.sidePanel API) | Persistent docked panel. Chrome 114+. Requires sidePanel permission. | |
| Expanded popup panel | Dashboard sections built into the popup window. Limited width, closes on click-away. | |

**User's choice:** Dedicated full-page dashboard
**Notes:** Cleaner separation from the popup; easier to build rich Recharts graphs with full page width.

---

## Dashboard Metrics

| Option | Description | Selected |
|--------|-------------|----------|
| RAM freed + hibernation activity | Session RAM freed, all-time count, timeline chart of hibernations. | ✓ |
| RAM + per-tab breakdown | All above + per-tab RAM table. | |
| Full analytics dashboard | RAM, tab ratios, hibernation rate, domain breakdown. | |

**User's choice:** RAM freed + hibernation activity
**Notes:** Focused, fast to build, delivers the core value. Per-tab breakdown deferred.

---

## Chart Library

| Option | Description | Selected |
|--------|-------------|----------|
| Recharts | React-native SVG, ~80KB gzip, CSP-safe. | ✓ |
| Chart.js via react-chartjs-2 | Canvas-based, ~170KB, CSP-safe. | |
| You decide | Claude picks. | |

**User's choice:** Recharts

---

## Deferred Phase 1 Settings

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — configurable timeout + domain whitelist only | Add Settings tab to dashboard with timeout slider and domain whitelist. No tab group protection. | ✓ |
| Yes — all deferred items (incl. Tab Group protection) | Full Phase 1 backlog cleared. | |
| No — defer to Phase 5 | Phase 2 stays FR-08/09/10 only. | |

**User's choice:** Yes — configurable timeout + domain whitelist UI
**Notes:** Tab Group protection remains deferred (needs tabGroups API and more UX work). Settings live in a Settings tab on the dashboard page, not in a separate options page.

---

## Settings Location

| Option | Description | Selected |
|--------|-------------|----------|
| Settings tab inside the dashboard page | Dashboard has Stats + Settings tabs. One destination for everything. | ✓ |
| Separate options page (chrome.runtime.openOptionsPage) | Dedicated options.html, accessible via extension right-click menu. | |
| Settings panel inside the popup | Gear icon reveals inline settings. Cramped for domain whitelist. | |

**User's choice:** Settings tab inside the dashboard page

---

## Thumbnail Capture Timing

| Option | Description | Selected |
|--------|-------------|----------|
| On tab switch (when user leaves the tab) | Capture on chrome.tabs.onActivated — requires briefly switching focus back to capture, then switching forward again. | |
| On first load / page complete only | Capture on onUpdated status=complete when tab is active. Simple, reliable baseline. | |
| Hybrid (user-defined) | Capture on page load as baseline + on-demand "Refresh thumbnails" button in dashboard. | ✓ |

**User's choice (Other/custom):** Hybrid approach — capture on page load (onUpdated status=complete, active tab only) as baseline, plus a "Refresh thumbnails" button in the dashboard for on-demand re-capture. Avoids focus-flashing complexity while providing a path to fresher screenshots.

---

## Thumbnail Storage

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB with tab-ID key, evict on tab close | Simple, session-scoped. ~25MB cap, auto-prune oldest. | ✓ |
| IndexedDB with URL key, persist across sessions | Reuse thumbnails if same URL reopens. Complex eviction. | |
| You decide | Claude picks. | |

**User's choice:** IndexedDB with tab-ID key, evict on tab close

---

## Claude's Discretion

- IndexedDB library (native API vs. `idb` wrapper)
- Dashboard tab/route state management (URL hash vs. React state)
- Popup list virtualization strategy
- Exact Recharts chart type (BarChart vs. AreaChart for timeline)
- Thumbnail fallback rendering style

## Deferred Ideas

- Tab Group protection (FR-03) — deferred further, Phase 5 candidate
- Focus-switching thumbnail capture (more accurate timing) — Phase 2+
- Per-tab RAM measurement via native messaging — far future
- URL-keyed thumbnail persistence across sessions — Phase 5 polish
- Chrome Side Panel — considered, rejected for Phase 2
