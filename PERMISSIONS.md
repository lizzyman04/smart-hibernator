# Permissions

Smart Hibernator follows a least-privilege approach to browser permissions (NFR-05). The unused `scripting` permission was removed in v1.0.1 (it was never called; `grep -rn "chrome.scripting" src/` returns no results). The six permissions below are each actively used by shipped functionality.

## Kept Permissions

| Permission | Justification | Call Site |
|------------|---------------|-----------|
| `storage` | Persists extension settings (hibernation timeout, allowlist/blocklist), AI classification cache, and hibernated-tab counts across browser sessions. | `chrome.storage.local` throughout the Service Worker — `storage.ts`, alarm tick in `hibernation.ts`, badge count in `index.ts` |
| `tabs` | Queries, discards, and updates tabs for the hibernation engine. Required to read tab metadata (URL, title, active state) and to invoke the native MV3 tab discard API. | `chrome.tabs.query()`, `chrome.tabs.discard()`, `chrome.tabs.get()`, `chrome.tabs.update()` in `src/background/hibernation.ts` and `src/background/index.ts` |
| `alarms` | Drives the recurring hibernation tick — the alarm fires every minute and triggers the AI classification + timeout check loop. | `chrome.alarms.create()` / `onAlarm.addListener()` in `src/background/alarms.ts` (`periodInMinutes: 1`) |
| `contextMenus` | Adds a right-click "Hibernate this tab" item to the browser context menu so users can hibernate individual tabs on demand. | `chrome.contextMenus.create()` in `src/background/contextMenus.ts`; listener in `src/background/index.ts` (line 221) |
| `activeTab` | Captures a visible-tab screenshot (WebP thumbnail) when a tab loads, used to render rich previews in the hibernated-tabs list. `tabs` permission alone is insufficient for `captureVisibleTab`. | `chrome.tabs.captureVisibleTab()` in `src/background/thumbnail.ts` |
| `offscreen` | Creates an offscreen document to run the ONNX Runtime Web AI classifier locally. The offscreen context is required to execute WASM-based inference without blocking the Service Worker. | `chrome.offscreen.createDocument()` in `src/background/classifier.ts`; ONNX session in `src/offscreen/main.ts` |

## Notes

- `activeTab` and `contextMenus` are intentionally kept (not removed) because they back shipped user-facing functionality — the thumbnail preview system and the right-click hibernation shortcut respectively. Removing them would require disabling those features (D-04: "justify, don't amputate").
- No `scripting` permission is requested. The extension uses `chrome.tabs.discard()` (native MV3 tab suspension) rather than URL-redirect injection, so script injection into page contexts is never needed.
- This document feeds the Chrome Web Store permission-justification fields at submission time (NFR-05 / D-04).
