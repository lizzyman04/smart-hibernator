# Phase 3: AI Intelligence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 03-ai-intelligence
**Areas discussed:** Vitality signals, Dynamic timeout mapping, Learning mechanism, AI visibility in UI

---

## Vitality Signals

| Option | Description | Selected |
|--------|-------------|----------|
| Revisit frequency | How often you return to a domain/URL. Simple, captures habits. | |
| Dwell time + recency | Time spent + how recently used. Partially tracked via lastActiveAt. | |
| Combined score | Weighted blend of revisit frequency, dwell time, and form activity. | ✓ |

**User's choice:** Combined score

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — domain heuristics | Preset domain categories (docs, productivity) boost vitality score. | ✓ |
| No — behavior only | Pure behavioral signals, no domain type assumptions. | |
| You decide | Claude picks implementation. | |

**User's choice:** Yes — domain heuristics as a signal

---

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB | Existing idb.ts infra. Per-domain/per-tab history rows. 14-day window. | ✓ |
| chrome.storage.local | Simpler but 10 MB quota — risky for power users. | |
| You decide | Claude chooses based on existing patterns. | |

**User's choice:** IndexedDB

---

## Dynamic Timeout Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Multipliers on base timeout | Vital = 4×, Semi-Active = 1.5×, Dead = 0.5×. Scales with user's base slider. | |
| Absolute fixed values | Vital = 240 min, Semi-Active = 60 min, Dead = 15 min. | |
| Never-hibernate for Vital | Vital never discarded. Semi-Active = 1.5×, Dead = 0.5× base. | ✓ |

**User's choice:** Never-hibernate for Vital

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to base timeout | Below confidence threshold, use base timeout_minutes as if no AI. | ✓ |
| Use Semi-Active delay | Low confidence defaults to middle class. | |
| You decide | Claude picks a sensible threshold. | |

**User's choice:** Fall back to base timeout (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — hardcoded multipliers | Semi-Active = 1.5×, Dead = 0.5× hardcoded for Phase 3. | ✓ |
| Yes — expose sliders | Add multiplier sliders to Settings tab in dashboard. | |
| You decide | Claude picks based on complexity tradeoff. | |

**User's choice:** No — hardcoded multipliers for Phase 3

---

## Learning Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Implicit only — wake events | Frictionless. Wake shortly after discard = misclassification signal. | |
| Both implicit + explicit | Wake events + "Keep Alive" button in popup. Richer signal. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Both implicit (wake events) + explicit (user marks tab)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Adjust per-domain thresholds | IndexedDB domain biases updated. ONNX weights stay static. | ✓ |
| Retrain model weights locally | More accurate but expensive. Complex in MV3. | |
| You decide | Claude picks simplest approach for FR-06. | |

**User's choice:** Adjust per-domain thresholds (Recommended)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cold start: base timeout | If insufficient data, skip AI entirely. Use flat base timeout. | ✓ |
| Cold start: domain heuristics only | Classify by domain type alone until behavioral data accumulates. | |
| No cold start handling | Start classifying immediately with whatever data exists. | |

**User's choice:** Yes — use base timeout with no AI during cold start

---

## AI Visibility in UI

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle — small badge in popup | Small V/S/D colored pill on each popup tab row. | ✓ |
| Invisible — AI acts silently | No UI exposure. User sees effects but not classification. | |
| Full — dedicated AI panel | New dashboard tab with per-domain breakdown and accuracy metrics. | |

**User's choice:** Subtle — small badge in popup tab list

---

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — AI summary section in Stats | Classification breakdown + learning status below existing charts. | ✓ |
| No — Stats tab stays as-is | AI operates silently, dashboard unchanged. | |
| New AI tab in dashboard | Separate dashboard tab for AI analytics. | |

**User's choice:** Yes — add AI summary section to Stats tab

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Alive button doubles as override | Strong Vital signal biases domain permanently in learned thresholds. | ✓ |
| Explicit override in Settings tab | Separate Force Vital / Force Dead per-domain controls. | |
| No override — AI only | Users adjust base timeout. AI adapts from wake events. | |

**User's choice:** Keep Alive button doubles as override

---

## Claude's Discretion

- ONNX model architecture and initial training data source
- Feature vector format and normalization strategy
- Offscreen Document ↔ Service Worker message protocol
- WebGPU vs. WASM fallback detection and switching
- Confidence threshold value for fallback (~0.6 suggested)
- Cold start minimum sample count
- IndexedDB schema for behavioral history
- Wake event "short window" duration for misclassification signal

## Deferred Ideas

- Model weight retraining in-browser — too expensive for MV3 in Phase 3
- User-adjustable multiplier sliders — Phase 5 polish candidate
- Explicit Force Vital / Force Dead per-domain overrides — Phase 5 power-user settings
