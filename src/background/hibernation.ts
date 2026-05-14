import type { TabMeta, HibernationEvent, ClassificationResult } from '../shared/types'
import { FORM_PROTECTION_MS, AI_CONFIDENCE_THRESHOLD } from '../shared/constants'
import { updateBadge } from './badge'
import { classifyBatch } from './classifier'

export function isDiscardable(
  tab: chrome.tabs.Tab,
  meta: TabMeta | undefined,
  now: number,
  protectedTabs: number[],
  protectedDomains: string[],
  timeoutMs: number,   // replaces TIMEOUT_MS constant; value comes from storage
  classification?: ClassificationResult  // optional — undefined = cold start / low confidence
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
  const lastActive = meta?.lastActiveAt ?? 0

  // AI classification integration (D-04 / D-05 / D-06 / D-07)
  // Placed AFTER all structural guards and BEFORE the base inactivity check.
  // Only applied when confidence >= AI_CONFIDENCE_THRESHOLD and label is non-null.
  let effectiveTimeoutMs = timeoutMs
  if (classification && classification.label !== null && classification.confidence >= AI_CONFIDENCE_THRESHOLD) {
    if (classification.label === 'Vital') return false  // D-04: never hibernate Vital tabs
    if (classification.label === 'Semi-Active') {
      effectiveTimeoutMs = timeoutMs * 1.5  // D-05: 1.5× timeout
    } else if (classification.label === 'Dead') {
      effectiveTimeoutMs = timeoutMs * 0.5  // D-06: 0.5× timeout
    }
  }
  // D-07 fallback: low confidence, null label, or undefined classification — use base timeoutMs exactly

  if (now - lastActive < effectiveTimeoutMs) return false
  if (meta?.lastFormActivity && now - meta.lastFormActivity < FORM_PROTECTION_MS) return false
  return true
}

export async function handleAlarmTick(): Promise<void> {
  // Read all required state in a single storage.get call for atomicity (Pitfall 2 mitigation)
  const result = await chrome.storage.local.get([
    'hibernation_enabled',
    'tab_meta',
    'protected_tabs',
    'protected_domains',
    'timeout_minutes',    // Phase 2 — user-configurable timeout
    'ai_classifications', // Phase 3 — per-tab classification cache { [tabId]: ClassificationResult }
  ])

  const hibernationEnabled = (result['hibernation_enabled'] as boolean) ?? true
  if (!hibernationEnabled) return

  const timeoutMs = ((result['timeout_minutes'] as number) ?? 45) * 60 * 1000

  const tabMeta = (result['tab_meta'] as Record<number, TabMeta>) ?? {}
  const protectedTabs = (result['protected_tabs'] as number[]) ?? []
  const protectedDomains = (result['protected_domains'] as string[]) ?? []
  const aiClassifications = ((result['ai_classifications'] as Record<number, ClassificationResult>) ?? {})

  // Query ALL tabs — isDiscardable handles URL/state filtering
  const tabs = await chrome.tabs.query({})
  const now = Date.now()

  // Phase 3: Build candidate list for classification BEFORE the per-tab discard loop.
  // Candidates mirror the structural guards in isDiscardable (pre-filter for efficiency).
  // We use the classifications already read above (aiClassifications) in the loop below —
  // do NOT re-read from storage after classifyBatch (would add a second get call per tick,
  // violating the Pitfall 2 atomic-read invariant). Cold start → aiClassifications is empty
  // → base timeout applies per D-07.
  const candidateTabs = tabs.filter((t) => {
    if (!t.id || !t.url) return false
    if (!t.url.startsWith('http://') && !t.url.startsWith('https://')) return false
    if (t.active) return false
    if (t.pinned) return false
    if (t.audible) return false
    if (t.status !== 'complete') return false
    if (protectedTabs.includes(t.id)) return false
    try {
      const hostname = new URL(t.url).hostname
      if (protectedDomains.includes(hostname)) return false
    } catch {
      return false
    }
    return true
  })

  if (candidateTabs.length > 0) {
    try {
      await classifyBatch(
        candidateTabs.map((t) => ({
          tabId: t.id!,
          url: t.url!,
          meta: tabMeta[t.id!] ?? { lastActiveAt: 0 },
        }))
      )
    } catch {
      // Offscreen document may not be ready on first tick — silently continue
    }
  }

  let newDiscards = 0

  for (const tab of tabs) {
    if (!tab.id) continue
    const meta = tabMeta[tab.id]
    const classification = aiClassifications[tab.id] // may be undefined (cold start)
    if (!isDiscardable(tab, meta, now, protectedTabs, protectedDomains, timeoutMs, classification)) continue

    try {
      const discarded = await chrome.tabs.discard(tab.id)
      // discard() returns undefined when the tab cannot be discarded (already discarded, active, protected)
      if (discarded !== undefined) {
        newDiscards++
        try {
          const evResult = await chrome.storage.local.get('hibernation_events')
          const events: HibernationEvent[] = (evResult['hibernation_events'] as HibernationEvent[]) ?? []
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
          events.push({ timestamp: Date.now(), tabId: tab.id!, url: tab.url! })
          await chrome.storage.local.set({
            hibernation_events: events.filter((e) => e.timestamp > cutoff),
          })
        } catch {
          // Storage quota exceeded or tab gone — silently continue
        }
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
