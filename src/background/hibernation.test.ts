import { describe, it, expect } from 'vitest'
import { isDiscardable } from './hibernation'
import type { TabMeta, ClassificationResult } from '../shared/types'
import { TIMEOUT_MS, FORM_PROTECTION_MS } from '../shared/constants'

const NOW = Date.now()
const EXPIRED = NOW - TIMEOUT_MS - 1000 // 1 second past the 45-min mark

function makeTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    url: 'https://example.com',
    status: 'complete',
    audible: false,
    ...overrides,
  }
}

describe('isDiscardable', () => {
  it('returns true for an idle, unprotected tab past the timeout', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS)).toBe(true)
  })

  it('returns false when lastActiveAt is within the 45-min timeout', () => {
    const meta: TabMeta = { lastActiveAt: NOW - 1000 } // 1 second ago
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for an active tab', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ active: true }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for an audible tab', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ audible: true }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for a pinned tab', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ pinned: true }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for an already-discarded tab', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ discarded: true }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for a chrome:// URL', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ url: 'chrome://settings' }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false when form activity is within 5-minute protection window', () => {
    const meta: TabMeta = {
      lastActiveAt: EXPIRED,
      lastFormActivity: NOW - (FORM_PROTECTION_MS - 30000), // 30s inside protection window
    }
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns true when form activity expired past 5-minute protection window', () => {
    const meta: TabMeta = {
      lastActiveAt: EXPIRED,
      lastFormActivity: NOW - (FORM_PROTECTION_MS + 1000), // 1s past protection window
    }
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS)).toBe(true)
  })

  it('returns false for a tab in protected_tabs list', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ id: 42 }), meta, NOW, [42], [], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for a tab with a protected domain', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ url: 'https://example.com/page' }), meta, NOW, [], ['example.com'], TIMEOUT_MS)).toBe(false)
  })

  it('returns false for a tab that has not finished loading (status !== complete)', () => {
    const meta: TabMeta = { lastActiveAt: EXPIRED }
    expect(isDiscardable(makeTab({ status: 'loading' }), meta, NOW, [], [], TIMEOUT_MS)).toBe(false)
  })
})

// ─── AI classification integration tests (FR-07) ─────────────────────────────

const makeClassification = (
  label: ClassificationResult['label'],
  confidence: number
): ClassificationResult => ({ label, confidence, cachedAt: NOW })

describe('isDiscardable AI integration (FR-07)', () => {
  // Helper: a tab that is a day past the base timeout (deeply expired)
  const DEEP_EXPIRED = NOW - TIMEOUT_MS * 2

  it('D-04: returns false for Vital classification regardless of inactivity', () => {
    const meta: TabMeta = { lastActiveAt: DEEP_EXPIRED }
    const c = makeClassification('Vital', 0.9)
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS, c)).toBe(false)
  })

  it('D-05: returns false when Semi-Active and elapsed is between 1× and 1.5× timeout', () => {
    // 1.2× timeout — past base timeout but not past 1.5× threshold
    const meta: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS * 1.2 }
    const c = makeClassification('Semi-Active', 0.8)
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS, c)).toBe(false)
  })

  it('D-05: returns true when Semi-Active and elapsed exceeds 1.5× timeout', () => {
    // 1.6× timeout — past the 1.5× Semi-Active threshold
    const meta: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS * 1.6 }
    const c = makeClassification('Semi-Active', 0.8)
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS, c)).toBe(true)
  })

  it('D-06: returns false when Dead and elapsed is below 0.5× timeout', () => {
    // 0.4× timeout — not yet past the Dead 0.5× threshold
    const meta: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS * 0.4 }
    const c = makeClassification('Dead', 0.85)
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS, c)).toBe(false)
  })

  it('D-06: returns true when Dead and elapsed exceeds 0.5× timeout', () => {
    // 0.6× timeout — past the Dead 0.5× threshold
    const meta: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS * 0.6 }
    const c = makeClassification('Dead', 0.85)
    expect(isDiscardable(makeTab(), meta, NOW, [], [], TIMEOUT_MS, c)).toBe(true)
  })

  it('D-07: low confidence falls back to base timeoutMs — Vital with confidence 0.3 does NOT short-circuit', () => {
    // Low confidence: elapsed < base timeout → should be false (not discardable)
    const metaShort: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS / 2 }
    const cLow = makeClassification('Vital', 0.3) // below AI_CONFIDENCE_THRESHOLD=0.6
    expect(isDiscardable(makeTab(), metaShort, NOW, [], [], TIMEOUT_MS, cLow)).toBe(false)

    // Low confidence: elapsed > base timeout → should be true (base timeout applies, not Vital override)
    const metaLong: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS - 1000 }
    expect(isDiscardable(makeTab(), metaLong, NOW, [], [], TIMEOUT_MS, cLow)).toBe(true)
  })

  it('D-07: undefined classification uses base timeoutMs', () => {
    // No classification — under base timeout = false
    const metaShort: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS / 2 }
    expect(isDiscardable(makeTab(), metaShort, NOW, [], [], TIMEOUT_MS, undefined)).toBe(false)

    // No classification — past base timeout = true
    const metaLong: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS - 1000 }
    expect(isDiscardable(makeTab(), metaLong, NOW, [], [], TIMEOUT_MS, undefined)).toBe(true)
  })

  it('D-07: null label falls back to base timeoutMs', () => {
    const cNull = makeClassification(null, 0.9) // high confidence but null label
    // Under base timeout → false
    const metaShort: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS / 2 }
    expect(isDiscardable(makeTab(), metaShort, NOW, [], [], TIMEOUT_MS, cNull)).toBe(false)
    // Past base timeout → true
    const metaLong: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS - 1000 }
    expect(isDiscardable(makeTab(), metaLong, NOW, [], [], TIMEOUT_MS, cNull)).toBe(true)
  })

  it('FR-07: AI integration does not override structural guards (active tab)', () => {
    // Dead tab with elapsed > 0.5× timeout, but tab is active — active wins (returns false)
    const meta: TabMeta = { lastActiveAt: NOW - TIMEOUT_MS * 0.6 }
    const cDead = makeClassification('Dead', 0.9)
    expect(isDiscardable(makeTab({ active: true }), meta, NOW, [], [], TIMEOUT_MS, cDead)).toBe(false)
  })
})
