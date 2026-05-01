import type { TabMeta } from '../shared/types'
import { TIMEOUT_MS, FORM_PROTECTION_MS } from '../shared/constants'
import { updateBadge } from './badge'

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
  // Read all required state in a single storage.get call for atomicity
  const result = await chrome.storage.local.get([
    'hibernation_enabled',
    'tab_meta',
    'protected_tabs',
    'protected_domains',
  ])

  const hibernationEnabled = (result['hibernation_enabled'] as boolean) ?? true
  if (!hibernationEnabled) return

  const tabMeta = (result['tab_meta'] as Record<number, TabMeta>) ?? {}
  const protectedTabs = (result['protected_tabs'] as number[]) ?? []
  const protectedDomains = (result['protected_domains'] as string[]) ?? []

  // Query ALL tabs — isDiscardable handles URL/state filtering
  const tabs = await chrome.tabs.query({})
  const now = Date.now()

  let newDiscards = 0

  for (const tab of tabs) {
    if (!tab.id) continue
    const meta = tabMeta[tab.id]
    if (!isDiscardable(tab, meta, now, protectedTabs, protectedDomains)) continue

    try {
      const discarded = await chrome.tabs.discard(tab.id)
      // discard() returns undefined when the tab cannot be discarded (already discarded, active, protected)
      if (discarded !== undefined) {
        newDiscards++
      }
    } catch {
      // Tab may have been closed between query and discard — silently continue
    }
  }

  if (newDiscards > 0) {
    const fresh = await chrome.storage.local.get('hibernated_count')
    const freshCount = ((fresh['hibernated_count'] as number) ?? 0) + newDiscards
    await chrome.storage.local.set({ hibernated_count: freshCount })
    await updateBadge(freshCount)
  }
}

export async function handleManualHibernate(tabId: number): Promise<void> {
  try {
    const discarded = await chrome.tabs.discard(tabId)
    if (discarded !== undefined) {
      const result = await chrome.storage.local.get('hibernated_count')
      const count = ((result['hibernated_count'] as number) ?? 0) + 1
      await chrome.storage.local.set({ hibernated_count: count })
      await updateBadge(count)
    }
  } catch {
    // Tab closed or not discardable — ignore
  }
}
