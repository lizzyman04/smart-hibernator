// Wave 0 stub — covers FR-08 IDB storage contract
// Real implementations (idb.ts) are created in Plan 02-02 (Wave 1)
// These tests become GREEN once idb.ts is implemented
import { describe, it, expect, beforeEach } from 'vitest'

// fake-indexeddb/auto is imported in vitest.setup.ts — no import needed here
// It installs global indexedDB, IDBKeyRange, etc. in jsdom scope

// Stub type to keep tests compilable before idb.ts exists
// Replace this import once idb.ts is created in Wave 1:
// import { putThumbnail, getThumbnail, deleteThumbnail, getAllThumbnails, pruneIfNeeded } from './idb'
// import type { ThumbnailRecord } from './idb'

interface ThumbnailRecord {
  tabId: number
  url: string
  dataUrl: string
  capturedAt: number
}

function makeThumbnail(overrides: Partial<ThumbnailRecord> = {}): ThumbnailRecord {
  return {
    tabId: 1,
    url: 'https://example.com',
    dataUrl: 'data:image/webp;base64,ABC',
    capturedAt: Date.now(),
    ...overrides,
  }
}

describe('idb CRUD (FR-08) — Wave 0 stubs', () => {
  it('Wave 0 infrastructure check: fake-indexeddb is available', () => {
    expect(typeof indexedDB).toBe('object')
  })

  it.todo('putThumbnail stores a record retrievable by getThumbnail')
  it.todo('getThumbnail returns undefined for a missing tabId')
  it.todo('deleteThumbnail removes the entry; subsequent getThumbnail returns undefined')
  it.todo('getAllThumbnails returns all stored records')
  it.todo('pruneIfNeeded evicts oldest entries when total dataUrl.length exceeds 25 MB cap')
})
