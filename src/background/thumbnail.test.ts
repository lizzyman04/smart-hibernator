// Wave 0 stub — covers FR-08 thumbnail compression contract
// Real implementation (thumbnail.ts) created in Plan 02-02 (Wave 1)
import { describe, it, expect, vi, beforeEach } from 'vitest'

// jsdom does not implement OffscreenCanvas — compressToWebP must guard and return null
// This test becomes GREEN once thumbnail.ts is implemented with the OffscreenCanvas guard

// Stub import — replace once thumbnail.ts exists in Wave 1:
// import { compressToWebP, captureAndStore } from './thumbnail'

describe('thumbnail compression (FR-08) — Wave 0 stubs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Wave 0 infrastructure check: OffscreenCanvas is not available in jsdom (expected)', () => {
    expect(typeof OffscreenCanvas).toBe('undefined')
  })

  it.todo('compressToWebP returns null when OffscreenCanvas is unavailable (jsdom guard)')
  it.todo('captureAndStore calls chrome.tabs.captureVisibleTab with the correct windowId')
  it.todo('captureAndStore skips storage when compressToWebP returns null')
})
