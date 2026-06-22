# Chrome Web Store Listing — Smart Hibernator

**D-11 Store listing copy, feature bullets, and screenshot plan.**

Use this document as the source of truth when filling in the CWS developer dashboard fields. Copy the text verbatim (or lightly adapt for CWS character limits).

---

## Extension name

```
Smart Hibernator
```

---

## Short description (132 characters max)

```
AI-powered tab hibernation. Saves RAM and battery. Restores tabs exactly as you left them. Zero telemetry.
```

*(108 characters — within limit)*

---

## Detailed description (full)

```
Smart Hibernator automatically suspends inactive tabs to reclaim RAM and battery — then restores them exactly as you left them, including scroll position and form input.

INTELLIGENT HIBERNATION
An on-device AI model learns which tabs you are likely to return to and adapts hibernation timing accordingly. Tabs you use frequently stay alive longer. Tabs you haven't touched in days hibernate sooner. All inference runs locally using ONNX Runtime Web — no data leaves your machine.

RICH PREVIEWS
Before hibernating a tab, Smart Hibernator captures a compressed WebP thumbnail. Your hibernated-tabs list shows rich previews so you always know which tab you are about to wake.

SAVE RAM & BATTERY
Most inactive tabs consume 50–200 MB of RAM each. Smart Hibernator discards them using Chrome's native tab-suspension API, freeing memory without losing the page. The dashboard shows your total RAM savings in real time.

PERFECT STATE RESTORATION
When you wake a hibernated tab, the page reloads instantly and the extension restores your exact scroll position and any form values you had filled in. Sensitive fields (passwords, file inputs, credit-card fields) are never captured.

FULL CONTROL
• Configurable inactivity timeout (default 45 minutes)
• Per-tab and per-domain "Keep Alive" allowlist
• Pinned and audible tabs are always protected
• Manual hibernation via right-click context menu and keyboard shortcut (Ctrl+Shift+S / ⌘+Shift+S)
• Dashboard with hibernation stats, RAM savings charts, and all settings

PRIVACY FIRST — ZERO TELEMETRY
Everything runs locally. No usage data, no analytics, no crash reports, no accounts. The AI trains on your browsing patterns and they never leave your browser. See PRIVACY.md on GitHub for the source-level verification.

OPEN SOURCE
Licensed MIT. Inspect the full source at github.com/lizzyman04/smart-hibernator.

BUILT FOR POWER USERS
Designed for people who work with 80–300+ tabs open. The spiritual successor to The Great Suspender, rebuilt on Manifest V3 with native tab suspension — no URL redirects, no broken back buttons.
```

---

## Feature bullets (for CWS listing highlights section)

- **Smart AI hibernation** — on-device ONNX model learns your tab habits and adapts timeouts automatically
- **RAM savings dashboard** — live chart of memory freed; see exactly how much RAM you have reclaimed
- **Perfect state restoration** — scroll position and form values restored when a tab wakes
- **Rich tab previews** — WebP thumbnails captured before hibernation so you always know what's sleeping
- **Privacy-first / zero telemetry** — no data ever leaves your device; full source on GitHub

---

## Category

**Productivity**

---

## Language

**English**

---

## Homepage URL

```
https://github.com/lizzyman04/smart-hibernator
```

*(Must match `homepage_url` in `manifest.json`)*

---

## Screenshots plan

CWS requires screenshots at **1280×800** or **640×400** px. Capture these from the per-OS screenshot pass (see `docs/CROSS-OS-SCREENSHOTS.md`).

### Required screenshots (upload all 4)

| Slot | Surface | Source file | Key visual element |
|------|---------|------------|-------------------|
| 1 | Popup with hibernated tabs | `mac-popup-tabs.png` | List of thumbnailed hibernated tabs, badge count, RAM freed |
| 2 | Dashboard — Stats tab | `mac-dashboard-stats.png` or `win-dashboard-stats.png` | RAM savings bar chart, total hibernated count |
| 3 | Dashboard — Settings tab | Any OS `*-dashboard-settings.png` | Timeout slider, allowlist input, theme toggle |
| 4 | Popup empty state | `mac-popup-empty.png` | "No tabs hibernated" zero-state message |

### Optional additional screenshots (if CWS allows more than 4)

| Slot | Surface | Source file |
|------|---------|------------|
| 5 | Popup on Windows (comparison) | `win-popup-tabs.png` |
| 6 | Right-click context menu | Capture on any OS showing "Hibernate this tab" item |

### Screenshot quality checklist

Before uploading each screenshot:

- [ ] Correct resolution (1280×800 or 640×400)
- [ ] Extension is loaded from a production build (not dev mode with hot-reload indicator)
- [ ] No browser address bar visible (use full-screen or cropped screenshot)
- [ ] Sufficient dummy data: at least 5 hibernated tabs in the popup list; chart in Stats tab has at least 3 sessions of data
- [ ] No personal information visible in tab titles or URLs (use dummy tabs or blur personal content)

---

## Promo tile

CWS accepts a **440×280** promotional tile (small) and/or a **920×680** marquee tile.

### Small promo tile (440×280) design brief

- Background: dark (`#0a0a0a` or matching the dashboard dark theme)
- Extension icon (128×128) centered top-left quadrant
- Text (right side or bottom):
  - Large: **"Smart Hibernator"**
  - Small: **"AI tab hibernation · Zero telemetry"**
- Badges: "Manifest V3" · "Open Source" · "Privacy First"

*(Design the tile using Figma, Canva, or similar and export at 2× resolution for Retina.)*

---

## Permission justification fields (CWS dashboard)

When CWS prompts you to justify each permission, use these one-liners:

| Permission | CWS justification |
|------------|-------------------|
| `storage` | Persists hibernation settings, allowlists, stats, and AI classification cache across sessions. |
| `tabs` | Queries tab metadata (URL, activity) and invokes the native tab discard API for hibernation. |
| `alarms` | Drives the recurring 1-minute hibernation check loop. |
| `contextMenus` | Adds a right-click "Hibernate this tab" item for manual hibernation. |
| `activeTab` | Captures visible-tab thumbnails (WebP) for the hibernated-tabs preview list. |
| `offscreen` | Runs the ONNX Runtime Web AI classifier in an isolated offscreen context. |

---

## Privacy practices (CWS Data Practices section)

Answer these CWS questions as follows:

| Question | Answer |
|----------|--------|
| Does your extension collect user data? | **No** |
| Does your extension transmit data to a server? | **No** |
| What data is collected? | **None** — all storage is local (chrome.storage.local + IndexedDB) |
| Is data encrypted in transit? | **N/A** (no data leaves the device) |
| Is data sold or used for advertising? | **No** |

Link to this repo's PRIVACY.md as the privacy policy URL.

---

## Launch checklist

Before submitting to CWS, verify all items:

- [ ] `npm run package` produces `smart-hibernator-1.0.1.zip` with no errors
- [ ] `dist/manifest.json` contains version `1.0.1`, no `scripting` permission, `homepage_url` present
- [ ] All 4 screenshots captured and resized to 1280×800
- [ ] Small promo tile designed and exported (440×280)
- [ ] NFR-01 memory gate passed (see `docs/MEMORY-RUNBOOK.md`)
- [ ] Cross-OS screenshot pass complete (see `docs/CROSS-OS-SCREENSHOTS.md`)
- [ ] PRIVACY.md and PERMISSIONS.md present in repo and linked from README
- [ ] CWS dashboard permission-justification fields filled
- [ ] CWS data practices section completed

---

*Document version: 1.0 — reflects Smart Hibernator v1.0.1 CWS submission readiness.*
