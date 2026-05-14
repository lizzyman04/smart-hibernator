// Wave 0 infrastructure stubs for FR-06 (learning mode — domain bias + wake misclassification)
// Behavioral tests (it.todo) will be filled by Wave 2 plan 03-03 once ai-learning.ts is created.
// Analog pattern: src/background/idb.test.ts "Wave 0 infrastructure check" idiom
import { describe, it, expect } from 'vitest'
import { AI_BIAS_MAX, AI_WAKE_SIGNAL_WINDOW_MS } from '../shared/constants'

describe('ai-learning (FR-06)', () => {
  it('Wave 0 infrastructure check: AI_BIAS_MAX is 1.0 and AI_WAKE_SIGNAL_WINDOW_MS is 5 minutes', () => {
    expect(AI_BIAS_MAX).toBe(1.0)
    expect(AI_WAKE_SIGNAL_WINDOW_MS).toBe(5 * 60 * 1000)
  })

  it.todo('FR-06: recordKeepAlive increments biasOffset by 0.2 clamped to AI_BIAS_MAX')
  it.todo('FR-06: recordKeepAlive increments keepAliveCount and writes updatedAt')
  it.todo('FR-06: recordWakeMisclassification only applies bias when wake is within AI_WAKE_SIGNAL_WINDOW_MS')
  it.todo('FR-06: closeTabVisit appends a TabHistoryRecord to the tab-history store')
})
