# Architecture Patterns: Smart Hibernator

**Domain:** Browser Extension / Tab Management
**Researched:** 2025-05-14

## Recommended Architecture

The system follows a **Service-Worker centric** architecture using Manifest V3, with specialized modules for heuristic evaluation and AI inference.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Background Service Worker** | The orchestrator. Manages timers (Alarms API) and tab lifecycle events. | Storage, Content Scripts, AI Engine |
| **Heuristic Engine** | Stateless evaluator of tab "vitality" based on basic metadata (pinned, audible, active). | Service Worker |
| **AI Inference Engine** | Runs ONNX/TF.js models to classify tabs based on semantic and behavioral features. | Service Worker |
| **Content Script** | Injected into pages to detect form input, scroll position, and user activity. | Service Worker (via Message Passing) |
| **Storage Layer** | Persistent storage for session snapshots and model weights (IndexedDB). | Service Worker |

### Data Flow

1. **Capture:** Service Worker listens for `chrome.tabs.onUpdated` or `onActivated`.
2. **Enrich:** Content scripts report form activity or scroll state.
3. **Analyze:** 
   - **Phase 1 (Heuristics):** Rapid check for "protection" flags (media, pinned).
   - **Phase 2 (AI):** If heuristics pass, AI Engine evaluates "Vitality Score" using URL/Title embeddings and historical behavior.
4. **Action:** Service Worker triggers `chrome.tabs.discard()` if score is below threshold and idle timer expires.
5. **Persistence:** Current state is synced to IndexedDB for crash recovery.

## Patterns to Follow

### Pattern 1: Native Discarding (Memory Saver)
**What:** Use the browser's native discarding capability instead of custom URL redirection.
**When:** For suspending tabs without changing their URL.
**Example:**
```typescript
chrome.tabs.discard(tabId, (discardedTab) => {
  console.log(`Tab ${tabId} has been suspended.`);
});
```

### Pattern 2: Local Embeddings (Semantic Search)
**What:** Using `Transformers.js` to generate vector embeddings for tab titles.
**When:** For grouping tabs or finding similar content.
**Example:**
```javascript
import { pipeline } from '@xenova/transformers';
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await extractor(tabTitle, { pooling: 'mean', normalize: true });
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Heavy DOM Access in Content Scripts
**What:** Scanning the entire DOM for "activity" frequently.
**Why bad:** High CPU usage and potential to slow down the user's browsing experience.
**Instead:** Use `MutationObserver` sparingly or focus on specific events like `keydown` on input fields.

### Anti-Pattern 2: `setTimeout` in Background Scripts
**What:** Using long-running timers for suspension.
**Why bad:** Manifest V3 service workers are ephemeral and will kill the timer when they go idle.
**Instead:** Use the `chrome.alarms` API.

## Scalability Considerations

| Concern | At 10 tabs | At 100 tabs | At 1000 tabs |
|---------|------------|--------------|-------------|
| **Memory** | Negligible. | Noticeable impact if models stay in RAM. | Significant. Must unload models when idle. |
| **Classification** | Instant. | May cause slight lag if synchronous. | Must use Web Workers for AI inference. |
| **Storage** | Small local storage. | IndexedDB recommended. | IndexedDB with frequent cleanup of old session snapshots. |

## Sources
- [Chrome Extensions: Manifest V3 Architecture](https://developer.chrome.com/docs/extensions/mv3/architecture-overview/)
- [ONNX Runtime Web Worker Example](https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/webworker)
