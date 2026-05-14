// IndexedDB CRUD + eviction for Smart Hibernator thumbnails + behavioral history
// Uses idb@8.0.3 module-level singleton pattern (RESEARCH.md Pattern 1)
// Phase 3: bumped to DB version 2; adds tab-history and domain-bias stores
import { openDB, type IDBPDatabase } from 'idb'
import { IDB_SIZE_CAP_BYTES } from '../shared/constants'
import type { TabHistoryRecord, DomainBiasRecord } from '../shared/types'

export interface ThumbnailRecord {
  tabId: number
  url: string
  dataUrl: string
  capturedAt: number
}

interface SmartHibernatorDB {
  thumbnails: {
    key: number        // tabId
    value: ThumbnailRecord
  }
  'tab-history': {
    key: number        // auto-increment
    value: TabHistoryRecord
    indexes: { 'by-domain': string; 'by-timestamp': number }
  }
  'domain-bias': {
    key: string        // domain string (primary key)
    value: DomainBiasRecord
  }
}

let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null

function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains('thumbnails')) {
            db.createObjectStore('thumbnails', { keyPath: 'tabId' })
          }
        }
        if (oldVersion < 2) {
          const histStore = db.createObjectStore('tab-history', { keyPath: 'id', autoIncrement: true })
          histStore.createIndex('by-domain', 'domain')
          histStore.createIndex('by-timestamp', 'timestamp')
          db.createObjectStore('domain-bias', { keyPath: 'domain' })
        }
      },
      blocked() {
        console.warn('[smart-hibernator] IDB upgrade blocked — close other extension tabs')
      },
      blocking() {
        // Close our connection so the other context can upgrade
        dbPromise = null
      },
    })
  }
  return dbPromise
}

// ─── Thumbnails store (Phase 2 — preserved) ────────────────────────────────

export async function putThumbnail(record: ThumbnailRecord): Promise<void> {
  const db = await getDb()
  await db.put('thumbnails', record)
}

export async function getThumbnail(tabId: number): Promise<ThumbnailRecord | undefined> {
  const db = await getDb()
  return db.get('thumbnails', tabId)
}

export async function deleteThumbnail(tabId: number): Promise<void> {
  const db = await getDb()
  await db.delete('thumbnails', tabId)
}

export async function getAllThumbnails(): Promise<ThumbnailRecord[]> {
  const db = await getDb()
  return db.getAll('thumbnails')
}

/**
 * Prune oldest entries when total IndexedDB thumbnail storage exceeds IDB_SIZE_CAP_BYTES (25 MB).
 * Approximation: base64 dataUrl.length * 0.75 ≈ decoded byte size.
 */
export async function pruneIfNeeded(): Promise<void> {
  const all = await getAllThumbnails()
  const totalBytes = all.reduce((sum, r) => sum + Math.ceil(r.dataUrl.length * 0.75), 0)
  if (totalBytes <= IDB_SIZE_CAP_BYTES) return

  // Sort oldest first (ascending capturedAt)
  const sorted = [...all].sort((a, b) => a.capturedAt - b.capturedAt)
  let remaining = totalBytes

  for (const record of sorted) {
    if (remaining <= IDB_SIZE_CAP_BYTES) break
    await deleteThumbnail(record.tabId)
    remaining -= Math.ceil(record.dataUrl.length * 0.75)
  }
}

// ─── tab-history store (Phase 3 — FR-06) ───────────────────────────────────

/**
 * Append a new tab history record. Uses add (not put) — auto-increment key.
 */
export async function appendTabHistory(record: TabHistoryRecord): Promise<void> {
  const db = await getDb()
  await db.add('tab-history', record)
}

/**
 * Get all tab history rows for a given domain with timestamp >= since.
 */
export async function getTabHistoryByDomain(domain: string, since: number): Promise<TabHistoryRecord[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('tab-history', 'by-domain', domain)
  return all.filter((r) => r.timestamp >= since)
}

/**
 * Return the total number of rows in the tab-history store.
 * Used by cold-start gate in classifier.ts.
 */
export async function countTabHistory(): Promise<number> {
  const db = await getDb()
  return db.count('tab-history')
}

/**
 * Delete all tab-history rows with timestamp <= cutoff (oldest rows).
 * Used by the 14-day rolling window pruning step.
 */
export async function pruneTabHistory(cutoff: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('tab-history', 'readwrite')
  const index = tx.store.index('by-timestamp')
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

// ─── domain-bias store (Phase 3 — FR-06) ────────────────────────────────────

/**
 * Retrieve per-domain bias record, or undefined if no entry yet.
 */
export async function getDomainBias(domain: string): Promise<DomainBiasRecord | undefined> {
  const db = await getDb()
  return db.get('domain-bias', domain)
}

/**
 * Upsert per-domain bias record (uses put — overwrites existing entry for domain).
 */
export async function putDomainBias(record: DomainBiasRecord): Promise<void> {
  const db = await getDb()
  await db.put('domain-bias', record)
}
