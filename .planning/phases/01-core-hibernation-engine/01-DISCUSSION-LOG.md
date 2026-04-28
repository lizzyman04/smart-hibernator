# Phase 1: Core Hibernation Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 01 - Core Hibernation Engine
**Areas discussed:** Inactivity settings exposure, Popup UI scope, Unsaved form detection, Tab Group protection

---

## Inactivity Settings Exposure

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcode 45 min for now | Service worker runs at a fixed 45 min. Settings UI comes in Phase 2. | ✓ |
| Preset options in popup | Popup dropdown: 15/30/45/60/90 min presets stored in chrome.storage.local. | |
| Full configurable input | User types any value via options page or popup field. | |

**User's choice:** Hardcode 45 min for now
**Notes:** Settings deferred entirely to Phase 2 dashboard.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — global toggle is essential | Boolean stored in chrome.storage.local. Toggle visible in popup. | ✓ |
| No — always-on in Phase 1 | Skip the toggle; hibernation runs unconditionally. | |

**User's choice:** Yes — global toggle is essential

---

## Popup UI Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal but branded | Styled popup: global toggle + hibernate button + protect toggle + count. | ✓ |
| Functional skeleton only | Raw HTML/React with zero styling. Phase 2 redesigns from scratch. | |
| Feature-complete for manual controls | Full manual controls including list of hibernated tabs. | |

**User's choice:** Minimal but branded

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — per-tab protection is a core power-user feature | Whitelist stored in chrome.storage.local. Toggle in popup. | ✓ |
| No — defer to Phase 2 | Phase 1 only shows global on/off + manual hibernate. | |

**User's choice:** Yes — per-tab protection is a core power-user feature

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — as a badge on extension icon + in popup | chrome.action.setBadgeText + popup body count. | ✓ |
| In popup only | Displayed inside popup, no badge on icon. | |
| No — defer to Phase 2 dashboard | Phase 1 popup shows no stats. | |

**User's choice:** Yes — as a badge on the extension icon + in popup

---

## Unsaved Form Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Input-activity heuristic | Content script listens for keydown/input events. Typed in last 5 min = protected. | ✓ |
| Dirty-field check | Compares current field values against defaultValue periodically. | |
| beforeunload presence | Protect if page has registered a beforeunload handler. | |

**User's choice:** Input-activity heuristic

---

| Option | Description | Selected |
|--------|-------------|----------|
| 5 minutes | No form interaction in 5 min → tab eligible for hibernation again. | ✓ |
| Until tab is closed or navigated | Once user types, tab stays protected until navigation. | |
| Same as global inactivity timeout | Form activity resets the 45-min clock. | |

**User's choice:** 5 minutes

---

## Tab Group Protection

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 2 | Phase 1 protects audible/pinned/active/form only. Tab Group support added later. | ✓ |
| Implement fully in Phase 1 | All tabs in any named Tab Group are automatically protected. | |
| Implement with user control | Right-click Tab Group to mark as Protected. More scope. | |

**User's choice:** Defer to Phase 2
**Notes:** tabGroups API not required in Phase 1. FR-03 tab group condition will be implemented in Phase 2.

---

## Claude's Discretion

- Project scaffold structure (CRXJS manifest entry points, TypeScript config, Vite config)
- Service Worker alarm polling interval
- Storage schema key names and tab metadata shape
- Extension icon badge color
- Content script injection strategy
- Chrome Alarms naming convention for per-tab timers

## Deferred Ideas

- Tab Group protection → Phase 2
- Configurable timeout threshold → Phase 2 settings dashboard
- Domain whitelist management UI → Phase 2
- Options page → Phase 2
