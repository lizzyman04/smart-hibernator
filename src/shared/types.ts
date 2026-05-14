export interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

export interface HibernationEvent {
  timestamp: number   // unix ms
  tabId: number
  url: string
}

// Phase 3 — AI Intelligence type definitions

export type TabVitality = 'Vital' | 'Semi-Active' | 'Dead'

export interface ClassificationResult {
  label: TabVitality | null
  confidence: number
  cachedAt: number
}

export interface TabHistoryRecord {
  id?: number
  domain: string
  url: string
  visitStart: number
  visitEnd: number
  dwellMs: number
  hadFormActivity: boolean
  timestamp: number
}

export interface DomainBiasRecord {
  domain: string
  biasOffset: number
  keepAliveCount: number
  misclassificationCount: number
  updatedAt: number
}

export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
  timeout_minutes: number              // Phase 2 — default 45; user-configurable
  hibernation_events: HibernationEvent[]  // Phase 2 — for 7-day chart; max 7 days retained
  ai_classifications: Record<number, ClassificationResult>  // Phase 3 — per-tab classification cache
  ai_install_date: number              // Phase 3 — unix ms; used for cold-start countdown
}

export type StorageKey = keyof StorageSchema

export async function getStorage<K extends keyof StorageSchema>(
  key: K
): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get(key)
  return result[key] as StorageSchema[K] | undefined
}

export async function setStorage<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}
