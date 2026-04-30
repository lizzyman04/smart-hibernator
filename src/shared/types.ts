export interface TabMeta {
  lastActiveAt: number
  lastFormActivity?: number
}

export interface StorageSchema {
  hibernation_enabled: boolean
  hibernated_count: number
  tab_meta: Record<number, TabMeta>
  protected_tabs: number[]
  protected_domains: string[]
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
