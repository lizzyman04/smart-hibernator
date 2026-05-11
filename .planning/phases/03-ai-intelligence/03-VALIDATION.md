---
phase: 03
slug: ai-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test` (full suite green)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Feature vector builder | classifier.ts | 0 | FR-05 | — | Internal Chrome API data only | unit | `npm test -- src/background/classifier.test.ts` | ❌ W0 | ⬜ pending |
| Offscreen message handler | offscreen | 0 | FR-05 | — | No external fetch | unit (mock ORT) | `npm test -- src/offscreen/main.test.ts` | ❌ W0 | ⬜ pending |
| IndexedDB tab-history store | idb.ts | 1 | FR-06 | — | Data stays local | unit | `npm test -- src/background/idb.test.ts` | ✅ extend | ⬜ pending |
| domain-bias write on Keep Alive | ai-learning.ts | 2 | FR-06 | — | Threshold update only | unit | `npm test -- src/background/ai-learning.test.ts` | ❌ W0 | ⬜ pending |
| isDiscardable() Vital → false | hibernation.ts | 2 | FR-07 | — | Never hibernates Vital | unit | `npm test -- src/background/hibernation.test.ts` | ✅ extend | ⬜ pending |
| isDiscardable() Semi-Active 1.5× | hibernation.ts | 2 | FR-07 | — | Correct delay | unit | `npm test -- src/background/hibernation.test.ts` | ✅ extend | ⬜ pending |
| isDiscardable() Dead 0.5× | hibernation.ts | 2 | FR-07 | — | Correct delay | unit | `npm test -- src/background/hibernation.test.ts` | ✅ extend | ⬜ pending |
| Low-confidence fallback | hibernation.ts | 2 | FR-07 | — | Base timeout used | unit | `npm test -- src/background/hibernation.test.ts` | ✅ extend | ⬜ pending |
| Cold start skip | classifier.ts | 2 | FR-07 | — | AI skipped cleanly | unit | `npm test -- src/background/classifier.test.ts` | ❌ W0 | ⬜ pending |
| Zero external fetch in offscreen | offscreen | 1 | NFR-04 | — | No telemetry | unit (spy) | `npm test -- src/offscreen/main.test.ts` | ❌ W0 | ⬜ pending |
| V/S/D pill renders | popup | 3 | FR-05 | — | Correct badge color | unit (React) | `npm test -- src/popup/App.test.tsx` | ✅ extend | ⬜ pending |
| AI summary section renders | dashboard | 3 | FR-05 | — | Classification counts | unit (React) | `npm test -- src/dashboard/App.test.tsx` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/background/classifier.test.ts` — stubs for FR-05 feature vector, FR-07 cold start
- [ ] `src/background/ai-learning.test.ts` — stubs for FR-06 domain bias read/write, Keep Alive signal
- [ ] `src/offscreen/main.test.ts` — stubs for FR-05 Offscreen message handler with mocked ORT session, NFR-04 zero fetch
- [ ] `scripts/generate-model.py` — Python script to generate `src/assets/classifier.onnx` (Wave 0 prerequisite)
- [ ] Python deps: `pip install scikit-learn skl2onnx onnx` (one-time Wave 0 setup, documented in README)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebGPU backend actually loads in Offscreen Document | NFR-03 | No DOM in test environment | Load unpacked extension in Chrome, open chrome://extensions/, check Offscreen Document console for "ORT provider: webgpu" |
| WASM fallback activates when WebGPU unavailable | NFR-03 | Cannot simulate absence of WebGPU in vitest | Disable WebGPU via chrome://flags, reload extension, verify classification still works |
| Inference ≤ 150ms wall clock | NFR-02 | vitest can't measure real ORT timing | Use performance.now() around classification call in Offscreen Document console |
| No network requests from extension | NFR-04 | DevTools Network panel check | Open DevTools → Network tab, clear, use extension for 5 min, confirm zero external requests |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
