# Domain Pitfalls: Smart Hibernator

**Domain:** Browser Tab Management
**Researched:** 2025-05-14

## Critical Pitfalls

### Pitfall 1: URL-Redirection "Lock-in"
**What goes wrong:** Original versions of *The Great Suspender* redirected tabs to an extension-specific URL. When the extension was disabled/banned, users lost thousands of tabs because the URLs were now invalid.
**Consequences:** Permanent data loss for users; reputational damage.
**Prevention:** **Always** use `chrome.tabs.discard`. If custom UI is needed, inject an overlay via content scripts instead of redirecting.

### Pitfall 2: Service Worker Ephemerality (Manifest V3)
**What goes wrong:** Developers assume background scripts stay active forever. In MV3, the service worker shuts down after ~30 seconds of inactivity.
**Consequences:** Timers (like `setTimeout`) stop working; state held in memory is lost.
**Prevention:** Use the `chrome.alarms` API for timing and `chrome.storage` / `IndexedDB` for state persistence.

### Pitfall 3: Incomplete Activity Detection
**What goes wrong:** Missing a "vitality" signal like a background file upload or a half-filled form.
**Consequences:** User loses progress on a long task (e.g., an email or a blog post).
**Prevention:** Use `chrome.tabs.onUpdated` to track status and inject content scripts to check for "dirty" forms before discarding.

## Moderate Pitfalls

### Pitfall 1: Model Loading Latency
**What goes wrong:** Loading a 50MB ONNX model every time the extension needs to classify a tab.
**Prevention:** Cache the model in IndexedDB and keep the service worker alive during heavy processing sessions. Use quantized models (INT8) to reduce size.

### Pitfall 2: "Discarding" Important Background Tasks
**What goes wrong:** Suspending a tab that is performing a background sync or is a "parent" to a popup.
**Prevention:** Check `tab.audible` and consider creating a whitelist of known "tool" domains (e.g., Spotify, Slack).

## Minor Pitfalls

### Pitfall 1: Notification Spam
**What goes wrong:** Notifying the user every time a tab is suspended.
**Prevention:** Make notifications optional or use subtle UI indicators (like a badge on the extension icon).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Classification Model** | Overfitting to a specific user's behavior. | Use a generic pre-trained model for "vitality" and allow users to "tweak" weights. |
| **State Restoration** | Inconsistent scroll position restoration. | Explicitly save scroll coordinates in `chrome.storage.local` before discarding. |
| **UX / UI** | Cluttered tab list. | Group similar tabs automatically using semantic embeddings. |

## Sources
- [The Great Suspender Malware Scandal & Recovery](https://www.zdnet.com/article/google-removes-the-great-suspender-from-chrome-web-store/)
- [Chrome Extension MV3 Migration Pitfalls](https://developer.chrome.com/docs/extensions/mv3/intro/)
