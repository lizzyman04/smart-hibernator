// IndexedDB CRUD + eviction for Smart Hibernator thumbnails + behavioral history
// Uses idb@8.0.3 module-level singleton pattern (RESEARCH.md Pattern 1)
// Phase 3: bumped to DB version 2; adds tab-history and domain-bias stores
import { openDB, type IDBPDatabase } from 'idb'
import { IDB_SIZE_CAP_BYTES } from '../shared/constants'
import type { TabHistoryRecord, DomainBiasRecord, TabStateSnapshot } from '../shared/types'

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
  'tab-state': {
    key: number        // tabId (keyPath)
    value: TabStateSnapshot
  }
}

let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null

function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 3, {
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
        if (oldVersion < 3) {
          db.createObjectStore('tab-state', { keyPath: 'tabId' })
        }
      },
      blocked() {
        console.warn('[smart-hibernator] IDB upgrade blocked — close other extension tabs')
      },
      blocking(_currentVersion, _blockedVersion, event) {
        // Nullify our cached promise so the next getDb() call re-opens
        dbPromise = null
        // Actually close the IDBDatabase connection so the other context's
        // upgrade can proceed — setting dbPromise=null alone does not close
        // the underlying connection (CR-03)
        ;(event.target as IDBDatabase).close()
      },
    })
  }
  return dbPromise
}

// ─── Quota-exceeded guard (D-07) ────────────────────────────────────────────
// Wraps IDB write paths: catch QuotaExceededError → evict oldest → retry once → give up.
// Reuses existing pruneIfNeeded() as the evict callback (oldest-first by capturedAt).
// No new eviction logic — RESEARCH.md "Don't Hand-Roll" Pattern 4.

export async function putWithQuotaGuard(
  write: () => Promise<void>,
  evict: () => Promise<void>,
): Promise<void> {
  try {
    await write()
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'QuotaExceeded')
    ) {
      // Evict oldest entries, then retry the write once. If the retry also fails,
      // give up silently — no unhandled rejection escapes (D-07).
      await evict().catch(() => {})
      try {
        await write()
      } catch {
        // Give up silently — D-07: no unhandled rejection
      }
    } else {
      // Non-quota errors fall through to the caller (preserve existing behavior)
      throw e
    }
  }
}

// ─── Thumbnails store (Phase 2 — preserved) ────────────────────────────────

export async function putThumbnail(record: ThumbnailRecord): Promise<void> {
  await putWithQuotaGuard(
    async () => {
      const db = await getDb()
      await db.put('thumbnails', record)
    },
    pruneIfNeeded,
  )
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

// ─── tab-state store (Phase 4 — FR-11) ───────────────────────────────────────

/**
 * Upsert a tab state snapshot keyed by tabId.
 * Wrapped with quota guard (D-07) — tab-state is a size-bearing store;
 * uses pruneIfNeeded (thumbnail oldest-first eviction) as the fallback evictor.
 */
export async function putTabState(record: TabStateSnapshot): Promise<void> {
  await putWithQuotaGuard(
    async () => {
      const db = await getDb()
      await db.put('tab-state', record)
    },
    pruneIfNeeded,
  )
}

/**
 * Retrieve a tab state snapshot by tabId, or undefined if not found.
 */
export async function getTabState(tabId: number): Promise<TabStateSnapshot | undefined> {
  const db = await getDb()
  return db.get('tab-state', tabId)
}

/**
 * Delete a tab state snapshot by tabId (D-06: delete-after-restore + onRemoved eviction).
 */
export async function deleteTabState(tabId: number): Promise<void> {
  const db = await getDb()
  await db.delete('tab-state', tabId)
}
