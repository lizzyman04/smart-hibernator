<p align="center">
  <img src="icons/icon128.png" alt="Smart Hibernator logo" width="120" height="120">
</p>

<h1 align="center">Smart Hibernator</h1>

<p align="center">
  <strong>Intelligent, privacy-first tab hibernation for Chrome &amp; Edge.</strong><br>
  Automatically suspends inactive tabs to reclaim RAM and battery — and restores them exactly as you left them.
</p>

<p align="center">
  <a href="#about">About</a> •
  <a href="#features">Features</a> •
  <a href="#how-it-works">How it works</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19">
  <img src="https://img.shields.io/badge/AI-on--device-FF6F00?style=flat-square&logo=onnx&logoColor=white" alt="On-device AI">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
</p>

---

## About

**Smart Hibernator** is a browser extension that suspends tabs you are not using so your browser stays fast and your laptop stays cool — the spiritual successor to The Great Suspender, rebuilt on Manifest V3.

It is built around four pillars:

- **Intelligent** — an on-device AI model learns which tabs you tend to return to and adapts hibernation timing accordingly.
- **Beautiful** — rich tab previews, a clean popup, and a full dashboard with live savings charts.
- **Private** — everything runs locally. No telemetry, no analytics, no accounts.
- **Reliable** — perfect state restoration brings back scroll position and form input after a tab wakes.

Built for power users who live with 80–300+ open tabs.

---

## Features

### Core hibernation
- Auto-suspends tabs after a configurable inactivity period (default **45 minutes**).
- Protects tabs you are actively using: **pinned**, **audible**, and tabs with **recent form input**.
- Manual control via the right-click context menu and a keyboard shortcut (`Ctrl+Shift+S`, `⌘+Shift+S` on macOS).
- Per-tab and per-domain allowlists ("Keep Alive").

### Rich UI
- **Thumbnail previews** — compressed WebP snapshots captured before a tab is discarded.
- **Popup** — a scrollable list of hibernated tabs with one-click wake.
- **Dashboard** — live RAM-savings charts, hibernation stats, and full settings.

### On-device AI intelligence
- **Vitality scoring** — classifies each tab as **Vital**, **Semi-Active**, or **Dead** using a local ONNX model.
- **Adaptive timeouts** — high-value tabs are kept alive longer; disposable ones are suspended sooner.
- **Continuous learning** — refines its model from your behavior over a rolling 14-day window, entirely on your machine.

### Perfect state restoration
- Restores **scroll position** and **form/input values** when a hibernated tab wakes.
- Sensitive fields (passwords, hidden inputs, file pickers, credit-card and one-time-code fields) are **never captured**.
- Restoration completes within a strict latency budget so waking a tab feels instant.

---

## How it works

Smart Hibernator is a Manifest V3 extension with four cooperating contexts:

| Context | Role |
|---------|------|
| **Service Worker** (`src/background`) | Owns hibernation logic, alarms, the badge, thumbnails, AI scheduling, and all IndexedDB state (tab history, thumbnails, saved tab state). |
| **Offscreen document** (`src/offscreen`) | Runs the ONNX classifier with WebGPU acceleration and a WASM fallback — MV3 service workers cannot run ORT directly. |
| **Content script** (`src/content`) | Captures scroll + form state (debounced, with privacy exclusions) and restores it on wake. |
| **UI** (`src/popup`, `src/dashboard`) | React 19 + Tailwind interfaces for managing tabs and viewing savings. |

The AI runs **only on your device**: features are extracted from local tab history, inference happens in the offscreen document, and the model adapts using signals (such as how quickly you wake a tab) that never leave the browser.

---

## Installation

### From the Chrome Web Store

*Submission pending — see [docs/STORE-LISTING.md](docs/STORE-LISTING.md) for the launch checklist.*

### Manual installation (developer mode)

```bash
git clone https://github.com/lizzyman04/smart-hibernator.git
cd smart-hibernator
npm install
npm run build
```

Then:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the generated `dist/` folder.

---

## Development

### Prerequisites

- **Node.js** 20.19+ (or 22+)
- **npm** 10+

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server with hot reload (CRXJS)
npm run build        # Production build → dist/
npm run package      # Production build + zip → smart-hibernator-<version>.zip (CWS upload)
npm test             # Unit + component tests (Vitest)
npm run test:e2e     # End-to-end browser tests (Playwright)
```

> The first time you run the e2e suite, install the browser binary:
> `npx playwright install chromium`

### Project structure

```
smart-hibernator/
├── manifest.json          # MV3 manifest
├── icons/                 # Extension icons
├── src/
│   ├── background/        # Service Worker: hibernation, alarms, AI, IndexedDB
│   ├── offscreen/         # ONNX classifier (WebGPU → WASM)
│   ├── content/           # Scroll + form capture/restore
│   ├── popup/             # Popup UI (React)
│   ├── dashboard/         # Dashboard page (React)
│   ├── components/ui/     # shadcn/ui components
│   ├── shared/            # Shared types and constants
│   ├── lib/               # Utilities
│   └── assets/            # Bundled ONNX model
├── tests/e2e/             # Playwright extension tests
└── dist/                  # Build output (load this in the browser)
```

### Tech stack

| Area | Technology |
|------|------------|
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix &amp; Base UI, Lucide icons |
| Charts | Recharts |
| Build | Vite 8 + CRXJS |
| Storage | IndexedDB (`idb`) |
| On-device AI | ONNX Runtime Web (WebGPU / WASM) |
| Testing | Vitest, Testing Library, Playwright |

---

## Testing

- **Unit & component** tests run under Vitest with a jsdom environment and `vitest-chrome` / `fake-indexeddb` shims:
  ```bash
  npm test
  ```
- **End-to-end** tests drive a real Chromium instance with the unpacked extension loaded, exercising flows such as state capture and restoration:
  ```bash
  npx playwright install chromium   # once
  npm run test:e2e
  ```

---

## Privacy

Smart Hibernator is **privacy-first by design**:

- **Zero telemetry** — no usage data ever leaves your device.
- **No analytics, no accounts, no network calls** for core functionality.
- **AI runs entirely locally** — inference and learning happen on your machine.
- **Sensitive form fields are never captured** during state restoration.

For the full privacy statement including source-level verification, see [PRIVACY.md](PRIVACY.md).

Requested permissions and why they are needed (see [PERMISSIONS.md](PERMISSIONS.md) for detailed justifications):

| Permission | Why |
|------------|-----|
| `storage` | Persist settings, stats, allowlists, and AI classification cache. |
| `tabs` | Detect inactivity and discard/restore tabs. |
| `alarms` | Periodically check which tabs should hibernate. |
| `contextMenus` | Right-click controls for hibernating/protecting tabs. |
| `activeTab` | Capture visible-tab thumbnails; act on the current tab from the popup/shortcut. |
| `offscreen` | Run the ONNX model outside the service worker. |

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Make your changes and ensure `npm test` passes.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `git commit -m "feat: add your feature"`.
5. Push and open a Pull Request.

---

## License

Released under the [MIT License](LICENSE).

---

<p align="center">
  <sub>Built for a faster, cleaner, more private browsing experience.</sub>
</p>
