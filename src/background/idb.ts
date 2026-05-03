// IndexedDB CRUD + eviction for Smart Hibernator thumbnails
// Uses idb@8.0.3 module-level singleton pattern (RESEARCH.md Pattern 1)
import { openDB, type IDBPDatabase } from 'idb'
import { IDB_SIZE_CAP_BYTES } from '../shared/constants'

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
}

let dbPromise: Promise<IDBPDatabase<SmartHibernatorDB>> | null = null

function getDb(): Promise<IDBPDatabase<SmartHibernatorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SmartHibernatorDB>('smart-hibernator', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'tabId' })
        }
      },
    })
  }
  return dbPromise
}

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
