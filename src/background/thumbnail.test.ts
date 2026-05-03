// Covers FR-08 thumbnail capture + compression contract
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressToWebP, captureAndStore } from './thumbnail'

// Mock the idb module so tests do not touch real IndexedDB
vi.mock('./idb', () => ({
  putThumbnail: vi.fn().mockResolvedValue(undefined),
  pruneIfNeeded: vi.fn().mockResolvedValue(undefined),
}))

describe('thumbnail compression (FR-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.tabs.captureVisibleTab).mockResolvedValue('data:image/png;base64,FAKEPNG')
  })

  it('Wave 0 infrastructure check: OffscreenCanvas is not available in jsdom (expected)', () => {
    expect(typeof OffscreenCanvas).toBe('undefined')
  })

  it('compressToWebP returns null when OffscreenCanvas is unavailable', async () => {
    const result = await compressToWebP('data:image/png;base64,ABC')
    expect(result).toBeNull()
  })

  it('captureAndStore calls chrome.tabs.captureVisibleTab with correct windowId', async () => {
    await captureAndStore(42, 'https://example.com', 1)
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(1, { format: 'png' })
  })

  it('captureAndStore does NOT call putThumbnail when compressToWebP returns null (jsdom)', async () => {
    const { putThumbnail } = await import('./idb')
    await captureAndStore(42, 'https://example.com', 1)
    // compressToWebP returns null in jsdom — putThumbnail must NOT be called
    expect(putThumbnail).not.toHaveBeenCalled()
  })
})
