# Privacy Policy — Smart Hibernator

**Zero telemetry. Everything stays on your device.**

Smart Hibernator is built on the principle that a tool you trust to observe your browser must never transmit anything about you anywhere. This document explains exactly what the extension does (and does not) do with your data.

---

## What we collect

**Nothing.**

Smart Hibernator collects zero usage data, analytics, or diagnostics. No data ever leaves your machine.

---

## Data stored locally

All data the extension creates stays exclusively on your device in Chrome's local storage APIs:

| What | Where | Why |
|------|-------|-----|
| Extension settings (timeout, allowlist, blocklist) | `chrome.storage.local` | Remember your preferences across sessions |
| Hibernated-tab stats and badge count | `chrome.storage.local` | Display RAM savings and badge in real time |
| AI classification cache (tab vitality labels + confidence) | `chrome.storage.local` | Persist AI decisions between alarm ticks |
| Tab-history feature rows (last-active, duration, wake counts) | IndexedDB (`smart-hibernator/tab-history`) | Train the local AI on your browsing patterns |
| Domain bias signals (wake-misclassification signals) | IndexedDB (`smart-hibernator/domain-bias`) | Continuously improve classification for your domains |
| Thumbnail previews (WebP, compressed) | IndexedDB (`smart-hibernator/thumbnails`) | Show rich tab previews in the popup |
| Scroll position and form-field state for in-flight tabs | IndexedDB (`smart-hibernator/tab-state`) | Restore exact page state when a tab wakes |

All stores are local-only. There is no sync, no backup, no cloud.

---

## What leaves your device

**Nothing from core functionality.** The extension has no network calls for:

- Telemetry or analytics
- Crash reporting
- Feature flags or remote config
- Model updates

**Verified evidence (source-level inspection, 2026-06-22):**

```
grep -rn "fetch(" src/         # 0 results
grep -rn "XMLHttpRequest" src/ # 0 results
grep -rn "sendBeacon" src/     # 0 results
```

All runtime I/O is `chrome.storage.local`, IndexedDB, and local ONNX model inference. The ONNX model file is bundled inside the extension package (`src/assets/`) and loaded locally — it is not downloaded at runtime.

---

## On-device AI

The AI classifier runs entirely on your machine:

1. **Features** are extracted from local tab-history rows (visit duration, last-active timestamp, wake frequency, domain-bias signals). No page content is read.
2. **Inference** runs in an Offscreen Document using ONNX Runtime Web (WebGPU → WASM fallback). The inference context is destroyed when idle to reclaim RAM (the primary memory-budget mechanism).
3. **Learning** adapts the model's domain-bias store from signals such as how quickly you wake a tab after hibernation — signals that reflect only your local behavior and never leave the browser.

---

## Sensitive form fields

During state restoration, the content script captures scroll position and form values so hibernated tabs wake exactly as you left them. Sensitive fields are **never captured**:

- Passwords (`type="password"`)
- File inputs (`type="file"`)
- Hidden inputs (`type="hidden"`)
- Fields with autocomplete attributes matching credit cards or one-time codes (e.g. `cc-number`, `one-time-code`)

---

## Permissions

Smart Hibernator requests the minimum permissions needed. See [PERMISSIONS.md](PERMISSIONS.md) for a line-by-line justification of each of the six kept permissions and the exact call sites in the source code.

The `scripting` permission was removed in v1.0.1 — it was never used (grep-confirmed zero `chrome.scripting` usages in `src/`).

---

## Open source

All source code is available at:
**https://github.com/lizzyman04/smart-hibernator**

You can audit every line. The privacy claims on this page are backed by the source, not by policy alone.

---

## Contact

Questions? Open an issue on GitHub or email the maintainer via the contact on the Chrome Web Store listing.

---

*Last updated: 2026-06-22 — reflects v1.0.1 source state.*
