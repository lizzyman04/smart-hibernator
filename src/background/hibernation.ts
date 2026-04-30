import type { TabMeta } from '../shared/types'
import { TIMEOUT_MS, FORM_PROTECTION_MS } from '../shared/constants'

export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[]
): boolean {
  if (!tab.id || !tab.url) return false
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return false
  if (tab.active) return false
  if (tab.audible) return false
  if (tab.pinned) return false
  if (tab.discarded) return false
  if (tab.status !== 'complete') return false
  if (protectedTabs.includes(tab.id)) return false
  try {
    const hostname = new URL(tab.url).hostname
    if (protectedDomains.includes(hostname)) return false
  } catch {
    return false
  }
  const lastActive = meta?.lastActiveAt ?? now
  if (now - lastActive < TIMEOUT_MS) return false
  if (meta?.lastFormActivity && now - meta.lastFormActivity < FORM_PROTECTION_MS) return false
  return true
}

export async function handleAlarmTick(): Promise<void> {
  // Implemented in Wave 1 Plan 02
}

export async function handleManualHibernate(tabId: number): Promise<void> {
  await chrome.tabs.discard(tabId)
}
