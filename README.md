<p align="center">
  <img src="icons/icon128.png" alt="Smart Hibernator Logo" width="128" height="128">
</p>

<h1 align="center">Smart Hibernator</h1>

<p align="center">
  <strong>Intelligent tab hibernation for Chrome and Edge</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-141d26?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Edge-141d26?style=for-the-badge&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
</p>

---

## 💡 About

**Smart Hibernator** is a privacy-first browser extension that intelligently suspends inactive tabs to save RAM and battery. The spiritual successor to The Great Suspender — modern, beautiful, and AI-powered.

- 🎯 **Smart**: Local AI that learns which tabs you'll need next
- 🎨 **Beautiful**: Rich previews and polished dashboard
- 🔒 **Private**: 100% local, zero telemetry, fully open-source
- ⚡ **Reliable**: Perfect state restoration and MV3 native

---

## ✨ Features

### Phase 1 — Core Hibernation
| Feature | Description |
|---------|-------------|
| Auto-suspend | Discard tabs after configurable inactivity (default 45 min) |
| Smart protection | Protect pinned, audible, and form-filled tabs from hibernation |
| Manual controls | Right-click menu and keyboard shortcut (`Ctrl+Shift+S`) |

### Phase 2 — Rich UI
| Feature | Description |
|---------|-------------|
| Thumbnail capture | Compressed WebP previews before discarding |
| Tab manager popup | Scrollable list of hibernated tabs with Wake buttons |
| Dashboard | Real-time RAM savings graphs and settings |

### Phase 3 — AI Intelligence *(coming soon)*
| Feature | Description |
|---------|-------------|
| Vitality scoring | Classify tabs as Vital, Semi-Active, or Dead |
| Adaptive timeouts | Dynamic hibernation delays based on behavior |
| Local learning | 14-day refinement — no data leaves your device |

---

## 🚀 Installation

### From Chrome Web Store *(coming soon)*
1. Visit the [Chrome Web Store page](#)
2. Click "Add to Chrome"
3. Done — the extension starts protecting your tabs

### Manual installation (developer mode)
```bash
git clone https://github.com/lizzyman04/smart-hibernator.git
cd smart-hibernator
npm install
npm run build
```

Then load `dist/` folder in `chrome://extensions` (Developer mode on).

---

## 🛠️ Development

### Prerequisites
- Node.js 20+
- npm 10+

### Commands
```bash
npm install      # Install dependencies
npm run dev      # Development mode with HMR
npm run build    # Production build
npm test         # Run tests (vitest)
npm run lint     # Lint TypeScript code
```

### Project Structure
```
smart-hibernator/
├── src/
│   ├── background/     # Service Worker
│   ├── popup/          # Popup UI (React)
│   ├── dashboard/      # Full dashboard page
│   └── shared/         # Types and constants
├── icons/              # Extension icons
├── tests/              # E2E tests (Playwright)
└── dist/               # Built extension
```

### Tech Stack
| Technology | Purpose |
|------------|---------|
| TypeScript | Type safety |
| React 19 | UI components |
| Tailwind CSS | Styling |
| Vite + CRXJS | Build system |
| shadcn/ui | Component library |
| Vitest + Playwright | Testing |
| ONNX Runtime Web | Local AI (Phase 3) |

---

## 🔒 Privacy Commitment

Smart Hibernator is **100% privacy-first**:
- ✅ Zero telemetry — no data ever leaves your device
- ✅ No analytics — no tracking, no pings
- ✅ All AI inference runs locally
- ✅ Minimal permissions: `storage`, `tabs`, `alarms`, `offscreen`

---

## 🤝 Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md).

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'feat: add amazing thing'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with 🤖 for a faster, cleaner browsing experience</sub>
</p>