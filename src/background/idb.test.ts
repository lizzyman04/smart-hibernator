// Covers FR-08 IDB CRUD + eviction contract (Phase 2 thumbnails)
// Covers FR-06 IDB CRUD contract (Phase 3 tab-history + domain-bias stores)
// Covers FR-11 IDB CRUD contract (Phase 4 tab-state store)
import { describe, it, expect, beforeEach } from 'vitest'
import {
  putThumbnail,
  getThumbnail,
  deleteThumbnail,
  getAllThumbnails,
  pruneIfNeeded,
  appendTabHistory,
  getTabHistoryByDomain,
  countTabHistory,
  pruneTabHistory,
  getDomainBias,
  putDomainBias,
  putTabState,
  getTabState,
  deleteTabState,
} from './idb'
import type { ThumbnailRecord } from './idb'
import type { TabHistoryRecord, DomainBiasRecord, TabStateSnapshot } from '../shared/types'
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

function makeHistoryRecord(overrides: Partial<TabHistoryRecord> = {}): TabHistoryRecord {
  return {
    domain: 'example.com',
    url: 'https://example.com/page',
    visitStart: Date.now() - 5000,
    visitEnd: Date.now(),
    dwellMs: 5000,
    hadFormActivity: false,
    timestamp: Date.now() - 5000,
    ...overrides,
  }
}

function makeBiasRecord(overrides: Partial<DomainBiasRecord> = {}): DomainBiasRecord {
  return {
    domain: 'example.com',
    biasOffset: 0.5,
    keepAliveCount: 1,
    misclassificationCount: 0,
    updatedAt: Date.now(),
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

describe('tab-history CRUD (FR-06)', () => {
  beforeEach(async () => {
    // Prune any rows from previous tests using a future cutoff
    await pruneTabHistory(Date.now() + 1_000_000)
  })

  it('appendTabHistory + getTabHistoryByDomain returns rows for matching domain within window', async () => {
    const now = Date.now()
    const record = makeHistoryRecord({ domain: 'github.com', timestamp: now - 1000 })
    await appendTabHistory(record)
    const rows = await getTabHistoryByDomain('github.com', now - 60_000)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].domain).toBe('github.com')
  })

  it('getTabHistoryByDomain filters out rows older than since timestamp', async () => {
    const ancient = Date.now() - 100_000
    await appendTabHistory(makeHistoryRecord({ domain: 'old.com', timestamp: ancient }))
    // Query with since = now - 1000 (recent window only)
    const rows = await getTabHistoryByDomain('old.com', Date.now() - 1000)
    expect(rows.length).toBe(0)
  })

  it('countTabHistory returns total row count', async () => {
    const beforeCount = await countTabHistory()
    await appendTabHistory(makeHistoryRecord({ domain: 'count-test.com' }))
    await appendTabHistory(makeHistoryRecord({ domain: 'count-test.com' }))
    const afterCount = await countTabHistory()
    expect(afterCount).toBe(beforeCount + 2)
  })

  it('pruneTabHistory deletes rows older than cutoff', async () => {
    const cutoffMs = Date.now() - 1000
    // Insert one old row (before cutoff) and one new row (after cutoff)
    const oldTs = cutoffMs - 500
    const newTs = Date.now()
    await appendTabHistory(makeHistoryRecord({ domain: 'prune-test.com', timestamp: oldTs }))
    await appendTabHistory(makeHistoryRecord({ domain: 'prune-test.com', timestamp: newTs }))
    await pruneTabHistory(cutoffMs)
    // Old row should be gone; new row should remain
    const remaining = await getTabHistoryByDomain('prune-test.com', 0)
    expect(remaining.every((r) => r.timestamp > cutoffMs)).toBe(true)
    expect(remaining.some((r) => r.timestamp === newTs)).toBe(true)
  })
})

describe('domain-bias CRUD (FR-06)', () => {
  it('putDomainBias + getDomainBias round-trip preserves all fields', async () => {
    const record = makeBiasRecord({ domain: 'bias-test.com', biasOffset: 0.75, keepAliveCount: 3, misclassificationCount: 1 })
    await putDomainBias(record)
    const retrieved = await getDomainBias('bias-test.com')
    expect(retrieved).toBeDefined()
    expect(retrieved!.domain).toBe('bias-test.com')
    expect(retrieved!.biasOffset).toBe(0.75)
    expect(retrieved!.keepAliveCount).toBe(3)
    expect(retrieved!.misclassificationCount).toBe(1)
    expect(retrieved!.updatedAt).toBe(record.updatedAt)
  })

  it('getDomainBias returns undefined for unknown domain', async () => {
    const result = await getDomainBias('unknown-domain-xyz.com')
    expect(result).toBeUndefined()
  })

  it('putDomainBias overwrites existing record for the same domain', async () => {
    await putDomainBias(makeBiasRecord({ domain: 'overwrite.com', biasOffset: 0.1 }))
    await putDomainBias(makeBiasRecord({ domain: 'overwrite.com', biasOffset: 0.9 }))
    const result = await getDomainBias('overwrite.com')
    expect(result!.biasOffset).toBe(0.9)
  })
})

function makeStateSnapshot(overrides: Partial<TabStateSnapshot> = {}): TabStateSnapshot {
  return {
    tabId: 1,
    url: 'https://example.com',
    scroll: { x: 0, y: 100 },
    fields: [],
    capturedAt: Date.now(),
    ...overrides,
  }
}

describe('tab-state CRUD (FR-11)', () => {
  it('putTabState stores a record retrievable by getTabState with matching url/scroll/fields', async () => {
    const snapshot = makeStateSnapshot({ tabId: 500, url: 'https://state-test.com', scroll: { x: 10, y: 200 } })
    await putTabState(snapshot)
    const result = await getTabState(500)
    expect(result).toBeDefined()
    expect(result!.url).toBe('https://state-test.com')
    expect(result!.scroll).toEqual({ x: 10, y: 200 })
    expect(result!.fields).toEqual([])
  })

  it('getTabState returns undefined for an unknown tabId', async () => {
    const result = await getTabState(99999)
    expect(result).toBeUndefined()
  })

  it('deleteTabState removes the entry; subsequent getTabState returns undefined', async () => {
    const snapshot = makeStateSnapshot({ tabId: 501 })
    await putTabState(snapshot)
    await deleteTabState(501)
    expect(await getTabState(501)).toBeUndefined()
  })

  it('a record with populated fields[] round-trips intact', async () => {
    const snapshot = makeStateSnapshot({
      tabId: 502,
      fields: [
        { id: 'email', name: 'email', value: 'user@example.com', type: 'input[text]' },
        { name: 'comment', value: 'hello world', type: 'textarea' },
      ],
    })
    await putTabState(snapshot)
    const result = await getTabState(502)
    expect(result).toBeDefined()
    expect(result!.fields).toHaveLength(2)
    expect(result!.fields[0].id).toBe('email')
    expect(result!.fields[0].value).toBe('user@example.com')
    expect(result!.fields[1].name).toBe('comment')
    expect(result!.fields[1].value).toBe('hello world')
  })
})
