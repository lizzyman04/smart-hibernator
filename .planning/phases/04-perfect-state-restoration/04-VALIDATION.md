---
phase: 04
slug: perfect-state-restoration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/content/form-watcher.test.ts src/background/idb.test.ts src/background/index.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (quick) / ~40 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (0 failures)
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| FR-11 | Capture: scroll + form values collected correctly | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ W0 |
| FR-11 | Capture: excluded field types (password/hidden/file/cc-*/otp/new-password) NOT captured (D-03) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ W0 |
| FR-11 | Restore: field matching id → name → selectorPath, skip unresolved (D-04) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ W0 |
| FR-11 | SW: SAVE_STATE message persists snapshot to IDB (SW-owned write, D-05) | unit | `npm test -- src/background/index.test.ts` | ✅ extend |
| FR-11 | SW: GET_STATE returns snapshot on URL match, null on mismatch (D-06/D-08) | unit | `npm test -- src/background/index.test.ts` | ✅ extend |
| FR-11 | SW: GET_STATE deletes snapshot after returning it (D-06) | unit | `npm test -- src/background/idb.test.ts` | ✅ extend |
| FR-11 | SW: onRemoved eviction deletes tab-state entry (D-06) | unit | `npm test -- src/background/index.test.ts` | ✅ extend |
| FR-11 | IDB: putTabState / getTabState / deleteTabState CRUD on tab-state store (D-05) | unit | `npm test -- src/background/idb.test.ts` | ✅ extend |
| FR-12 | MutationObserver disconnects within RESTORE_CAP_MS (~550ms) (D-07) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ W0 |
| FR-12 | Restore does not exceed 600ms cap (fake-timer assertion) | unit | `npm test -- src/content/form-watcher.test.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — all ⬜ pending at plan time.*

**FR-12 fake-timer requirement** (vitest issue #9352 — `performance.now()` is not faked by default):

```typescript
// In form-watcher.test.ts — required for performance.now() to be controlled
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})
```

---

## Wave 0 Requirements

- [ ] `src/content/form-watcher.test.ts` — NEW; covers FR-11 capture/restore + FR-12 timing (currently no test file for content script)
- [ ] Extend `src/background/idb.test.ts` — add `tab-state` CRUD describe block (putTabState/getTabState/deleteTabState + v3 upgrade)
- [ ] Extend `src/background/index.test.ts` — add SAVE_STATE, GET_STATE (match + mismatch), onRemoved eviction cases
- [ ] `vitest.setup.ts` — confirm existing chrome mocks cover sendMessage/onMessage/sender.tab.id; add stubs only if a new API surfaces (none expected)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real scroll position restored on a live discarded tab | FR-11 | jsdom has no real layout/scroll; native discard not reproducible in unit tests | Load extension unpacked, scroll a long page, force-discard via chrome://discards, reactivate; confirm scroll lands at prior offset |
| Form text re-injected on live SPA after wake | FR-11 | Real DOM + async SPA mount not reproducible in jsdom | Type into a form (incl. a `type=password` to confirm it is NOT restored), discard, reactivate; confirm text fields restore, password blank |
| End-to-end restore < 600ms on real hardware | FR-12 | Unit fake-timer asserts the cap logic, not real-device wall-clock incl. SW cold start | Measure activation→restore via performance marks or chrome://discards timing on target device |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (form-watcher.test.ts, idb/index extensions)
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
