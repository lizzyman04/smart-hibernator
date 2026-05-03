// Covers FR-08 IDB CRUD + eviction contract
import { describe, it, expect, beforeEach } from 'vitest'
import { putThumbnail, getThumbnail, deleteThumbnail, getAllThumbnails, pruneIfNeeded } from './idb'
import type { ThumbnailRecord } from './idb'
import { IDB_SIZE_CAP_BYTES } from '../shared/constants'

// fake-indexeddb/auto is imported in vitest.setup.ts — global indexedDB is available

function makeThumbnail(overrides: Partial<ThumbnailRecord> = {}): ThumbnailRecord {
  return {
    tabId: 1,
    url: 'https://example.com',
    dataUrl: 'data:image/webp;base64,ABC',
    capturedAt: Date.now(),
    ...overrides,
  }
}

describe('idb CRUD (FR-08)', () => {
  it('Wave 0 infrastructure check: fake-indexeddb is available', () => {
    expect(typeof indexedDB).toBe('object')
  })

  it('putThumbnail stores a record retrievable by getThumbnail', async () => {
    await putThumbnail(makeThumbnail({ tabId: 42 }))
    const result = await getThumbnail(42)
    expect(result?.tabId).toBe(42)
    expect(result?.url).toBe('https://example.com')
  })

  it('getThumbnail returns undefined for a missing tabId', async () => {
    const result = await getThumbnail(9999)
    expect(result).toBeUndefined()
  })

  it('deleteThumbnail removes the entry; subsequent getThumbnail returns undefined', async () => {
    await putThumbnail(makeThumbnail({ tabId: 7 }))
    await deleteThumbnail(7)
    expect(await getThumbnail(7)).toBeUndefined()
  })

  it('getAllThumbnails returns all stored records', async () => {
    await putThumbnail(makeThumbnail({ tabId: 100 }))
    await putThumbnail(makeThumbnail({ tabId: 101 }))
    const all = await getAllThumbnails()
    const ids = all.map((r) => r.tabId)
    expect(ids).toContain(100)
    expect(ids).toContain(101)
  })

  it('pruneIfNeeded evicts oldest entry when total size exceeds 25 MB cap', async () => {
    // Simulate two entries where total exceeds IDB_SIZE_CAP_BYTES
    // Use a large dataUrl that together exceeds the cap
    const HALF_CAP = IDB_SIZE_CAP_BYTES / 0.75 / 2 + 1000  // slightly over half cap when decoded
    const bigDataUrl = 'data:image/webp;base64,' + 'A'.repeat(Math.ceil(HALF_CAP))
    await putThumbnail({ tabId: 200, url: 'https://old.com', dataUrl: bigDataUrl, capturedAt: 1000 })
    await putThumbnail({ tabId: 201, url: 'https://new.com', dataUrl: bigDataUrl, capturedAt: 2000 })
    await pruneIfNeeded()
    // The older entry (tabId 200, capturedAt 1000) should be evicted
    expect(await getThumbnail(200)).toBeUndefined()
    // The newer entry (tabId 201, capturedAt 2000) should remain
    expect(await getThumbnail(201)).toBeDefined()
  })
})
