# Research Summary: Smart Hibernator

**Domain:** Browser Tab Management & Activity Classification
**Researched:** 2025-05-14
**Overall confidence:** HIGH

## Executive Summary

Smart Hibernator is a modern browser extension designed to optimize system resources by identifying and suspending "dead" tabs while protecting "vital" ones. This research surveyed the ecosystem of tab management, focusing on heuristics from established players like *The Great Suspender* and *The Marvellous Suspender*, and explored the feasibility of local AI classification using ONNX/TF.js.

Key findings indicate that while traditional extensions rely on simple inactivity timers and "protection" flags (media, pinned), there is a significant opportunity to use local AI (specifically **ONNX Runtime Web** with **WebGPU**) to predict user intent and "vitality." The project "Tabs.do" provides a research-backed blueprint for task-centric tab management and ML-based classification.

## Key Findings

**Stack:** Chrome Extension (Manifest V3), TypeScript, ONNX Runtime Web (WebGPU), and Transformers.js for semantic embeddings.
**Architecture:** Service-Worker centric with a dual-phase classification system: Phase 1 (Heuristic screening) and Phase 2 (Local AI "Vitality" scoring).
**Critical pitfall:** Avoid URL-redirection suspension (used by the original *The Great Suspender*) in favor of **Native Tab Discarding** to ensure user data safety.

## Implications for Roadmap

Based on research, the following phase structure is recommended:

1. **Phase 1: Core Utility (Heuristics)** - Focus on the "Table Stakes."
   - Implement the Manifest V3 service worker and Alarms API.
   - Build a robust heuristic engine (timer-based, media detection, pinned exemption).
   - Use `chrome.tabs.discard` for safe suspension.

2. **Phase 2: Data & State** - Lay the foundation for AI.
   - Implement behavioral tracking (active time, switch frequency) stored in IndexedDB.
   - Build "dirty form" detection via content scripts to prevent data loss.

3. **Phase 3: AI Intelligence** - Integrate local inference.
   - Integrate ONNX Runtime Web.
   - Implement "Vitality" scoring using a local model (e.g., Random Forest or small Neural Net).
   - Implement Semantic Grouping using Transformers.js embeddings.

4. **Phase 4: Advanced UX** - Predictive features.
   - Context-aware suspension (Battery/RAM-based).
   - Search-branch detection and auto-cleanup.

**Phase ordering rationale:**
- Reliability first. Users must trust that the extension won't lose their data (Phase 1 & 2) before they accept AI-driven decisions (Phase 3).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Clear industry shift towards ORT-Web and WebGPU for browser AI. |
| Features | HIGH | Well-documented user needs and competitive landscape. |
| Architecture | MEDIUM | MV3 ephemerality adds complexity to AI model loading. |
| Pitfalls | HIGH | Lessons from *The Great Suspender* are very well documented. |

## Gaps to Address

- **Dataset Availability:** Publicly labeled datasets for "tab vitality" are scarce due to privacy. The project may need a "data collection" period where users can opt-in to help train the model locally.
- **Model Size:** Balancing model accuracy with the memory overhead of the extension runtime.
