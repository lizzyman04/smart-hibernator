# Feature Landscape: Smart Hibernator

**Domain:** Browser Tab Management & Activity Classification
**Researched:** 2025-05-14

## Table Stakes (Heuristic-based)

Features required for a viable and safe tab suspender.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Auto-Suspension** | Save memory from idle tabs. | Low | Timer-based (e.g., 30m, 1h). |
| **Whitelisting** | Prevent suspension of critical sites (Gmail, Slack). | Low | Domain and regex-based. |
| **Media Protection** | Don't kill tabs playing music/video. | Low | Check `tab.audible` and `tab.muted`. |
| **Form Protection** | Prevent data loss in active inputs. | Medium | Requires content script to detect input. |
| **Pinned Tab Exemption** | Pinned tabs usually signal intent to keep. | Low | Simple API check. |
| **One-Click Restore** | Seamlessly bring tabs back to life. | Low | Using `chrome.tabs.discard` (native). |

## Differentiators (AI-driven)

Features that use local AI to improve classification and UX.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Semantic Grouping** | Automatically group tabs by task (e.g., "Research", "Shopping"). | High | Use BERT/SBERT embeddings via Transformers.js. |
| **"Vitality" Score** | Predict which tabs the user will return to vs. "Dead" tabs. | High | Random Forest or TabNet model on behavioral data. |
| **Context-Aware Suspension** | Suspend differently based on battery vs. plugged in, or current system RAM. | Medium | Use `navigator.getBattery()` and `chrome.system.memory`. |
| **Search-Branch Detection** | Identify search result pages that have been "exhausted" and can be closed. | Medium | Analyze URL patterns and "parent" tab relationships. |
| **Intent Detection** | Detect if a tab is a "reminder" (kept open just to look at later) vs. "active tool". | High | Behavioral analysis (scroll depth, interaction frequency). |

## Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **URL Redirection** | Obsolete, risky (link rot if extension is removed). | Use Native Tab Discarding (`chrome.tabs.discard`). |
| **Cloud-based Classification** | Privacy concerns, latency. | Perform all inference locally using ONNX Runtime Web. |
| **Aggressive CPU Killing** | Can crash the browser or lose state. | Prioritize memory (discard) over process killing. |

## Feature Dependencies

```
Behavioral Tracking (Heuristic) → "Vitality" Model (AI)
URL Parsing → Search-Branch Detection (AI)
Task Classification (AI) → Auto-Tab Grouping (UX)
```

## MVP Recommendation

Prioritize:
1. **Heuristic-based Auto-Suspension** (Core utility).
2. **Form & Media Protection** (Reliability/Safety).
3. **Basic "Vitality" Score (AI)** (Differentiator - simple Random Forest on local data).

Defer: **Semantic Grouping** (Complex UI/UX requirements).

## Sources
- [Tabs.do: Task-centric Browser Tab Management](https://github.com/Zhenhui-PENG/Tabs.do)
- [The Marvellous Suspender Heuristics](https://github.com/gioxx/MarvellousSuspender)
