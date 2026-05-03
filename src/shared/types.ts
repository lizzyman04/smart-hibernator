export interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

export interface HibernationEvent {
  timestamp: number   // unix ms
  tabId: number
  url: string
}

export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
  timeout_minutes: number              // Phase 2 — default 45; user-configurable
  hibernation_events: HibernationEvent[]  // Phase 2 — for 7-day chart; max 7 days retained
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
