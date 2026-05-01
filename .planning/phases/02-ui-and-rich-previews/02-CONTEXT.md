# Phase 2: UI & Rich Previews - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 enhances the extension with visual feedback, saved-state visibility, and user-configurable settings:

- **Thumbnail capture**: Capture a compressed WebP screenshot (≤ 250 KB) of each tab on page load and store in IndexedDB; provide on-demand re-capture via dashboard button.
- **Popup redesign**: Transform the Phase 1 minimal popup into a hibernated-tab manager: scrollable list of hibernated tabs showing thumbnail, favicon, title, and a per-tab "Wake" button. Tab count badge retained. Global toggle retained.
- **Dashboard page**: Full-page `dashboard.html` with two tabs — **Stats** (Recharts graphs: session RAM freed + hibernation activity timeline) and **Settings** (configurable timeout, domain whitelist management).
- **Configurable timeout**: Replace the hardcoded 45-min `TIMEOUT_MS` constant with a user-settable value stored in `chrome.storage.local` (default: 45 min).
- **Domain whitelist UI**: Allow users to add/remove entries from `protected_domains` via the Settings tab in the dashboard.

**Not in Phase 2:**
- Tab Group protection (FR-03) — deferred further; needs `tabGroups` API and more UX design.
- AI classification (Phase 3).
- State restoration / scroll position (Phase 4).
- `chrome.sidePanel` API — dedicated dashboard page is preferred.

</domain>

<decisions>
## Implementation Decisions

### Hibernation Approach (FR-08 / FR-09)
- **D-01:** **Keep `chrome.tabs.discard()` from Phase 1** — no redirect to extension page. The tab slot shows Chrome's native "not loaded" state. The popup becomes the preview surface for hibernated tabs.
- **D-02:** The popup must NOT navigate the tab to a placeholder URL. FR-09's "placeholder experience" is delivered through the popup UI, not through tab navigation.

### Popup Redesign
- **D-03:** The popup is redesigned into a **hibernated-tab manager**. When tabs have been hibernated, the popup shows a scrollable list; each row contains:
  - WebP thumbnail (from IndexedDB, fallback to favicon if unavailable)
  - Tab favicon + title
  - Domain
  - A **"Wake"** button that calls `chrome.tabs.discard()` reversal (i.e., activates/reloads the tab)
- **D-04:** The existing Phase 1 elements are retained: global hibernation toggle, total hibernated count badge, "Hibernate this tab" button (now at the top of the list), "Protect this tab" toggle.
- **D-05:** A **"Dashboard →"** button is added to the popup footer, opening `dashboard.html` via `chrome.tabs.create()`.

### Dashboard Page
- **D-06:** Dashboard is a dedicated extension page at `src/dashboard/index.html` (registered in manifest), opened via `chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })`.
- **D-07:** Dashboard has two tabs: **Stats** and **Settings**.
  - **Stats tab**: Shows total RAM freed this session (estimated), all-time hibernated count, a timeline chart of hibernations over the past 7 days (bar chart via Recharts).
  - **Settings tab**: Configurable inactivity timeout (slider + numeric input, 5–240 min, default 45) and domain whitelist management (add/remove text input + list).
- **D-08:** Chart library: **Recharts** (React-native SVG, CSP-safe, no inline scripts).
- **D-09:** Dashboard polls `chrome.storage.local` on mount and subscribes to `chrome.storage.onChanged` for live updates — same pattern as Phase 1 popup.

### Settings (Deferred from Phase 1)
- **D-10:** **Configurable timeout** stored as `timeout_minutes: number` in `chrome.storage.local` (new key; default 45). The background `hibernation.ts` reads this value from storage instead of using the hardcoded `TIMEOUT_MS` constant.
- **D-11:** **Domain whitelist UI** manages the existing `protected_domains: string[]` storage key. Users type a domain (e.g., `github.com`) into an input and click "Add". Existing entries are shown as removable chips.
- **D-12:** Tab Group protection is **not included in Phase 2**. It remains deferred.

### Thumbnail Capture & Storage
- **D-13:** Thumbnails are captured in the Service Worker on `chrome.tabs.onUpdated` when `status === 'complete'` for HTTP/HTTPS tabs. Uses `chrome.tabs.captureVisibleTab()` — requires tab to be active, so capture only fires if the updated tab IS the active tab.
- **D-14:** Dashboard provides a **"Refresh thumbnails"** button that iterates hibernated tabs and re-captures on-demand (user-triggered; solves stale-capture without focus-flashing complexity).
- **D-15:** Thumbnails stored in **IndexedDB** (database: `smart-hibernator`, store: `thumbnails`) keyed by `tabId` (number). Value: `{ tabId, url, dataUrl: string (WebP base64), capturedAt: number }`.
- **D-16:** Eviction policy: delete entry when `chrome.tabs.onRemoved` fires for that tabId, or when a hibernated tab is woken. Storage cap: ~25 MB total (~100 thumbnails at 250 KB each). Auto-prune oldest entries if cap is exceeded.
- **D-17:** WebP compression target: ≤ 250 KB. Use `canvas.toDataURL('image/webp', 0.7)` compression. Scale screenshot to max 800×600 before encoding to keep under cap reliably.

### RAM Savings Estimation
- **D-18:** RAM freed is estimated, not measured (no system API available in MV3). Use a conservative per-tab estimate of **150 MB per hibernated tab** (industry average for a loaded browser tab). Display as "~X MB freed" with the tilde to signal approximation.

### Claude's Discretion
- IndexedDB library choice (native IDB API vs. `idb` wrapper from Jake Archibald)
- Dashboard route/tab state management (URL hash vs. React state)
- Popup list virtualization (only needed if hibernated count exceeds ~50 tabs; use simple CSS overflow for Phase 2)
- Exact Recharts chart types (BarChart vs. AreaChart for timeline — pick whichest is cleaner)
- Thumbnail fallback rendering when no screenshot exists (favicon-centered colored card)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/REQUIREMENTS.md` — FR-08, FR-09, FR-10 are the Phase 2 requirements; FR-03 (Tab Group protection) is NOT in scope
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, and phase dependencies
- `.planning/PROJECT.md` — Core pillars: Intelligence, Aesthetics, Privacy, Reliability

### Phase 1 Foundation (MUST read — Phase 2 extends this)
- `.planning/phases/01-core-hibernation-engine/01-CONTEXT.md` — Locked Phase 1 decisions; D-01 through D-08 establish storage schema, hibernation strategy, and component patterns that Phase 2 extends
- `.planning/STATE.md` — Key decisions log including vitest-chrome workarounds, CRXJS patterns, and Phase 1 deviations

### Architecture
- `.planning/research/ARCHITECTURE.md` — Service Worker centric architecture; IndexedDB usage for large data; anti-patterns (no setTimeout in SW)
- `.planning/research/STACK.md` — Technology stack decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/button.tsx` — shadcn Button; use for Wake button, Add domain button, Dashboard link
- `src/components/ui/switch.tsx` — shadcn Switch; use for global toggle (already in popup), per-domain toggles
- `src/components/ui/separator.tsx` — shadcn Separator; use for popup section dividers
- `src/components/ui/badge.tsx` — shadcn Badge (currently unused); now usable for domain whitelist chips
- `src/lib/utils.ts` — `cn()` Tailwind class merging utility; use in all new components
- `src/shared/types.ts` — `StorageSchema` interface; extend with `timeout_minutes: number` key
- `src/shared/constants.ts` — `TIMEOUT_MS` constant; will be replaced by storage-read value in Phase 2
- `src/background/storage.ts` — `getStorage` / `setStorage` typed helpers; use for all storage reads

### Established Patterns
- `chrome.storage.onChanged` subscription with cleanup in `useEffect` — established in `src/popup/App.tsx`; replicate for dashboard
- Alarm-based background tick — `src/background/hibernation.ts` reads storage keys atomically; Phase 2 adds `timeout_minutes` to the read
- Badge update pattern — `src/background/badge.ts` + `chrome.action.setBadgeText`; no changes needed
- React 19 + Vite 8 + CRXJS 2.x + Tailwind CSS 4 + shadcn/ui — all new pages follow the same build setup

### Integration Points
- `src/background/index.ts` — add `chrome.tabs.onUpdated` listener for thumbnail capture
- `src/background/hibernation.ts` — replace `TIMEOUT_MS` constant with `await getStorage('timeout_minutes')` * 60 * 1000
- `manifest.json` — add `src/dashboard/index.html` as `web_accessible_resources` or as an `action.default_popup` alternate; needs `storage` permission already present; `scripting` permission already present (captureVisibleTab needs `activeTab` or `tabs`)
- `src/shared/types.ts` — add `timeout_minutes: number` and `hibernation_events: HibernationEvent[]` to `StorageSchema`

</code_context>

<specifics>
## Specific Ideas

- The popup tab list should feel like a lightweight tab manager — users should be able to wake any hibernated tab without switching to it first
- The "Wake" button should call `chrome.tabs.update(tabId, { active: true })` which triggers Chrome to reload the discarded tab and focus it
- Dashboard Stats tab: show "~{N} MB freed" prominently (large number, amber color) as the hero metric, with the Recharts timeline chart below
- Dashboard Settings tab: timeout slider should show the value live (e.g., "45 minutes") as user drags; domain whitelist should show `protected_domains` array as removable chips
- Thumbnail fallback: show a small favicon centered on a dark gradient card with the domain name — no broken image icons
- RAM estimate: 150 MB per hibernated tab is conservative and defensible; display with tilde prefix ("~300 MB freed") to be honest about estimation

</specifics>

<deferred>
## Deferred Ideas

- **Tab Group protection** (FR-03) — deferred further; requires `tabGroups` permission and dedicated UX. Phase 5 candidate.
- **Capture on tab switch** (focus-flashing approach) — more accurate thumbnail timing but involves briefly switching active tab focus. Deferred for Phase 2+.
- **Per-tab RAM measurement** — system API not available in MV3. Would require native messaging to a host app. Far future.
- **URL-keyed thumbnail persistence** — reuse thumbnails across sessions for the same URL. Phase 5 polish candidate.
- **Chrome Side Panel** — `chrome.sidePanel` API considered but dedicated dashboard page preferred for Phase 2.

</deferred>

---

*Phase: 02-ui-and-rich-previews*
*Context gathered: 2026-05-01*
