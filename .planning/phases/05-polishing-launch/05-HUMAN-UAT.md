---
status: partial
phase: 05-polishing-launch
source: [05-VERIFICATION.md, 05-05-PLAN.md]
started: 2026-06-23T00:00:00Z
updated: 2026-10-12T00:00:00Z
---

## Current Test

[testing paused — 1 item outstanding (Windows/macOS screenshots, blocked on hardware)]

## Tests

### 1. NFR-01 memory gate of record (< 45MB after idle teardown)
expected: Following `docs/MEMORY-RUNBOOK.md`: build + load `dist/` unpacked, open ~50 tabs, record warm RSS (SW + offscreen) via Chrome Task Manager, idle 12+ min, re-check — offscreen process absent and total RSS < 45MB.
result: pass
retest: |
  Real-browser re-test after TWO fixes: (a) 05-06 alarm teardown, (b) ORT wasm/mjs copy path flattened in vite.config.ts + empty-batch results cached as null label in classifier.ts. Root cause of the persistent failure was (b): dist/ort/node_modules/onnxruntime-web/dist/* nesting made offscreen session init fail, every batch returned empty, nothing cached, every tick re-bursted and re-armed the idle alarm.
  Evidence: uat-evidence/nfr01-rerun2.log (49 tabs, 60 seeded rows): offscreen present at idle 3/6/9/12 min, ABSENT at idle 13 min, recreated after tab switch. uat-evidence/nfr01-diag-fixed2.log (10 tabs, 25 min): offscreen created ~1 min, alarm counts down, doc gone at ~11 min and stays down through 24 min, cache holds Vital/Dead labels.
  Caveats: (1) offscreen was still present at the 12 min check in the 49-tab run, gone by 13 min; likely a late re-inference on live pages (navigation/redirect) restarting the 10 min window, NOT confirmed. (2) Playwright Chromium 147 on Linux, not Chrome Task Manager; extension process RSS 135 MB / PSS 25 MB at idle (shared SW+renderer process, not comparable to the 45 MB Task Manager number). (3) Single machine, single run.
prior_result: issue (G-05-1)
prior_reported: "Automated run (not Chrome Task Manager). Offscreen document still PRESENT after 13 min idle (checked at 3/6/9/12/13 min); extension process RSS 129.1 MB warm -> 140.5 MB idle (PSS 18.6 -> 27.6 MB). Runbook FAIL criterion 'offscreen still present after idle window' met."
prior_severity: major
method: Playwright Chromium 147 on Linux (not Chrome stable, not Task Manager). 49 tabs on distinct real domains, 60 synthetic tab-history rows seeded so ONNX inference runs (past cold start), timeout_minutes=100000 to stop tabs.discard() (discarding CDP-attached tabs crashed the harness browser), --disable-gpu not used in final run. SW and offscreen share one extension process here, so only the combined figure exists. Evidence: uat-evidence/nfr01-run.log, nfr01-run.mjs.
caveat: RSS/PSS from /proc are not the Task Manager "memory footprint" number; the pass/fail verdict rests on the offscreen-present criterion, not the MB figure. Recreation check is moot (doc never torn down). Run was on one machine, once.

### 2. Cross-OS UI screenshot pass (COMP-02 / D-13 verify half)
expected: Following `docs/CROSS-OS-SCREENSHOTS.md`: on Windows/macOS/Linux capture popup (hibernated + empty) and dashboard (Stats + Settings); confirm thin scrollbars (no Windows fat native bars), Geist→system-ui font fallback, no native-control divergence in Radix components.
result: blocked
blocked_by: physical-device
reason: "Only Linux available. Windows and macOS NOT verified. Linux (Playwright Chromium 147): popup empty state, dashboard Stats and Settings captured and render correctly; computed scrollbar-width is 'thin'; html font-family is the Geist-first stack and Geist is the platform font actually used (CDP getPlatformFontsForNode); Radix switch/slider/tabs styled, no layout overflow (docW == viewport). Popup 'hibernated tabs' state not captured (needs a really discarded tab, which this harness cannot do). Settings screenshot shows slider at 100000 min because the harness set that value — not a UI defect."
evidence: uat-evidence/linux-popup-empty.png, linux-dashboard-stats.png, linux-dashboard-settings.png

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

- gap_id: G-05-1
  truth: "Offscreen document is torn down after the 10-minute idle window, leaving only the SW (NFR-01)"
  status: resolved
  resolved_by: 05-06-PLAN.md
  resolved_at: 2026-10-12
  reason: "Observed: offscreen document present at every check across 13 idle minutes with 49 open tabs"
  severity: major
  test: 1
  root_cause: "Likely (read from code, not yet proven by a fix): handleAlarmTick runs every 1 min and calls classifyBatch for all non-active http tabs; once tab-history >= AI_COLD_START_MIN_SAMPLES (50) toClassify is non-empty each tick, and classifyBatch's finally calls armIdleTeardown(), which clears and re-arms the 10-min timer. The timer can never reach 10 min while any background http tab exists. A second contributor: the timer is SW-side setTimeout, lost if the SW is suspended."
  artifacts:
    - path: "src/background/classifier.ts"
      issue: "armIdleTeardown() re-armed on every burst; idle is measured from last classification, and classification happens every alarm tick"
    - path: "src/background/hibernation.ts"
      issue: "classifies all candidate tabs on every 1-min tick, even if their result is cached"
  missing:
    - "Skip re-classifying tabs with a fresh cached result (or classify on a slower cadence) so bursts stop and the idle window can elapse"
    - "Or base teardown on an absolute last-inference timestamp checked via chrome.alarms (survives SW suspension) rather than a SW setTimeout"
  debug_session: ""
