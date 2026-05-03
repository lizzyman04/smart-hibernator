import { describe, it, expect } from 'vitest'
import { isDiscardable } from './hibernation'
import type { TabMeta } from '../shared/types'
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
