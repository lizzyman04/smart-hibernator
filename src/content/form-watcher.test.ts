// Covers FR-11 scroll+form capture/restore and FR-12 timing contract (Phase 4)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEBOUNCE_MS, RESTORE_CAP_MS } from '../shared/constants'

// Mock dependencies (chrome.runtime is provided by vitest-chrome in vitest.setup.ts)

beforeEach(() => {
  vi.clearAllMocks()
  // CRITICAL: performance.now() is not faked by default — must opt-in explicitly
  // See: github.com/vitest-dev/vitest/issues/9352
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

it('Wave 0 infrastructure check: DEBOUNCE_MS and RESTORE_CAP_MS constants are defined', () => {
  // Verifies shared/constants exports before any behavior tests
  expect(DEBOUNCE_MS).toBe(500)
  expect(RESTORE_CAP_MS).toBe(550)
})

describe('captureState (FR-11 — capture)', () => {
  it.todo('debounced capture sends SAVE_STATE after DEBOUNCE_MS with scroll + fields')
})

describe('shouldCapture exclusions (FR-11 D-03)', () => {
  it.todo('returns false for password inputs')
})

describe('resolveField matching (FR-11 D-04)', () => {
  it.todo('matches field by id when id is present')
})

describe('startRestore / MutationObserver cap (FR-12)', () => {
  it.todo('MutationObserver disconnects within RESTORE_CAP_MS when cap expires')
})
