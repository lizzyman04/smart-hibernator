// Wave 0 infrastructure stubs for FR-05 (tab vitality classification) and FR-07 (cold start handling)
// Behavioral tests (it.todo) will be filled by Wave 1 plan 03-02 once classifier.ts is created.
// Analog pattern: src/background/idb.test.ts "Wave 0 infrastructure check" idiom
import { describe, it, expect } from 'vitest'
import {
  AI_COLD_START_MIN_SAMPLES,
  AI_CONFIDENCE_THRESHOLD,
} from '../shared/constants'

describe('classifier (FR-05 / FR-07)', () => {
  it('Wave 0 infrastructure check: AI_COLD_START_MIN_SAMPLES is defined and is a positive integer', () => {
    expect(AI_COLD_START_MIN_SAMPLES).toBeGreaterThan(0)
    expect(Number.isInteger(AI_COLD_START_MIN_SAMPLES)).toBe(true)
  })

  it('Wave 0 infrastructure check: AI_CONFIDENCE_THRESHOLD is between 0 and 1', () => {
    expect(AI_CONFIDENCE_THRESHOLD).toBeGreaterThan(0)
    expect(AI_CONFIDENCE_THRESHOLD).toBeLessThan(1)
  })

  it.todo('FR-05: buildFeaturesForTab returns a 6-element number array for a tab with history')
  it.todo('FR-07: buildFeaturesForTab returns null when total tab-history rows are below AI_COLD_START_MIN_SAMPLES')
  it.todo('FR-05: classifyBatch sends CLASSIFY_BATCH message via chrome.runtime.sendMessage and caches result in chrome.storage.local')
})
