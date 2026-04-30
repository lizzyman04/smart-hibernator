# Smart Hibernator - Requirements Specification

## 1. Vision & Strategy
Smart Hibernator is a privacy-first, local-AI driven Chrome extension that intelligently suspends inactive tabs to save RAM and battery. It aims to be the spiritual successor to The Great Suspender, providing a beautiful, stable, and "smart" experience.

### Success Metrics
- 1M active users within 12 months.
- 4.9+ star rating on Chrome Web Store.
- Zero-telemetry, privacy-first user trust.

## 2. Functional Requirements (FR)

### 2.1 Hibernation Engine
- **FR-01: Auto-Suspend**: Automatically discard tabs based on inactivity (default 45 min).
- **FR-02: Native Discarding**: Use `chrome.tabs.discard()` to offload memory while keeping tabs in the tab strip.
- **FR-03: Heuristic Protection**: Automatically protect tabs that are:
    - Audible/Playing media.
    - Pinned.
    - Containing unsaved form input.
    - Active/Focused.
    - Part of a protected Tab Group.
- **FR-04: Manual Controls**: Right-click context menu, keyboard shortcuts (Ctrl+Shift+S), and popup button for manual suspension.

### 2.2 Local AI Module
- **FR-05: Tab Vitality Classification**: Use ONNX Runtime Web in an Offscreen Document to classify tabs as "Vital", "Semi-Active", or "Dead".
- **FR-06: Learning Mode**: First 14 days of usage used to refine local classification thresholds.
- **FR-07: Dynamic Timeouts**: Adjust hibernation delay based on domain-specific patterns and AI confidence.

### 2.3 Rich Previews & UI
- **FR-08: Thumbnail Capture**: Capture a compressed WebP thumbnail (≤ 250 KB) before discarding.
- **FR-09: Placeholder Page**: Replace discarded tab content with a beautiful placeholder showing the thumbnail, RAM savings, and restoration button.
- **FR-10: Dashboard**: A central UI showing real-time RAM/CPU savings graphs and hibernation statistics.

### 2.4 State Restoration
- **FR-11: Perfect Restore**: Content scripts must capture and restore scroll position, form data, and SPA state (via `sessionStorage`).
- **FR-12: Low Latency**: Restoration must complete in < 600ms upon tab activation.

## 3. Non-Functional Requirements (NFR)

### 3.1 Performance
- **NFR-01: Extension RAM Usage**: ≤ 45 MB total.
- **NFR-02: Inference Latency**: ≤ 150ms per classification.
- **NFR-03: WASM Acceleration**: Use WebGPU/SIMD via ORT-Web for efficient processing.

### 3.2 Security & Privacy
- **NFR-04: Zero Telemetry**: No data ever leaves the device.
- **NFR-05: Permission Minimalism**: Strictly adhere to MV3 required permissions (`offscreen`, `storage`, `tabs`, `alarms`).
- **NFR-06: Manifest V3 Compliance**: 100% native MV3 implementation.

### 3.3 Compatibility
- **COMP-01: Browsers**: Chrome 120+, Edge Chromium.
- **COMP-02: OS**: Windows, macOS, Linux, ChromeOS.

## 4. Technical Stack
- **Framework**: React 19 + Vite + CRXJS.
- **Language**: TypeScript.
- **Styling**: Tailwind CSS + shadcn/ui.
- **AI**: ONNX Runtime Web (bundled models).
- **Storage**: IndexedDB (previews/state) + chrome.storage.local (settings).

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-01 | Phase 1 | Pending |
| FR-02 | Phase 1 | Pending |
| FR-03 | Phase 1 | Pending |
| FR-04 | Phase 1 | Pending |
| FR-05 | Phase 3 | Pending |
| FR-06 | Phase 3 | Pending |
| FR-07 | Phase 3 | Pending |
| FR-08 | Phase 2 | Pending |
| FR-09 | Phase 2 | Pending |
| FR-10 | Phase 2 | Pending |
| FR-11 | Phase 4 | Pending |
| FR-12 | Phase 4 | Pending |
| NFR-01 | Phase 5 | Pending |
| NFR-02 | Phase 3 | Pending |
| NFR-03 | Phase 3 | Pending |
| NFR-04 | Phase 3 | Pending |
| NFR-05 | Phase 1 | In Progress (manifest permissions correct; runtime verify in 01-04) |
| NFR-06 | Phase 1 | In Progress (MV3 scaffold built; runtime verify in 01-04) |
| COMP-01 | Phase 1 | In Progress (build succeeds; E2E verify in 01-04) |
| COMP-02 | Phase 1 | In Progress (no OS-specific code; verify in 01-04) |
