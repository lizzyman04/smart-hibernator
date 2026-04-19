# Technology Stack: Smart Hibernator

**Project:** Smart Hibernator
**Researched:** 2025-05-14
**Overall confidence:** HIGH

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Chrome Extension API | Manifest V3 | Browser Integration | Industry standard, mandatory for modern Chromium browsers. |
| TypeScript | 5.x | Logic & Typing | Scalability and type safety for complex tab state management. |

### Local AI / Machine Learning
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **ONNX Runtime Web** | Latest | Inference Engine | High performance, supports WebGPU for fast local inference. |
| **Transformers.js** | 2.x/3.x | NLP/Embeddings | Simplifies running Hugging Face models for semantic tab classification. |
| TensorFlow.js | (Alternative) | Custom Models | Best if on-device training or fine-tuning is required. |

### Data Storage & Management
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| IndexedDB | Native | State Persistence | Handles large amounts of structured data (session snapshots, tab metadata). |
| Chrome Storage | sync/local | Configuration | Stores user preferences and small state fragments. |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **db.js** | Latest | IndexedDB Wrapper | Simplifies database operations (used by The Great Suspender). |
| **Alarms API** | Native | Background Tasks | Replaces `setTimeout` for Manifest V3 background service workers. |
| **Scripting API** | Native | Content Injection | Used for detecting form data or injecting "suspension" overlays. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| AI Engine | ONNX Runtime Web | TensorFlow.js | ORT-Web has better WebGPU support and faster inference for pre-trained models. |
| Suspension | Native Discarding | URL Redirection | URL redirection is prone to "lost tabs" if the extension is disabled/removed. |
| Language | TypeScript | JavaScript | TS provides better DX for complex state machines. |

## Installation

```bash
# Core Dependencies
npm install onnxruntime-web transformers.js db.js

# Dev Dependencies
npm install -D typescript @types/chrome
```

## Sources
- [ONNX Runtime Web vs TensorFlow.js Performance](https://medium.com/@onnxruntime/onnx-runtime-web-running-ai-models-in-the-browser-with-webgpu-7e50c6095030)
- [The Great Suspender Source Code Analysis](https://github.com/greatsuspender/thegreatsuspender)
- [Tabs.do Research Paper Implementation](https://github.com/Zhenhui-PENG/Tabs.do)
