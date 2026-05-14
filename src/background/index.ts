// Service Worker entry point
// CRITICAL: ALL listeners registered synchronously at module top level
// Do NOT move any listener registration inside async callbacks
import { handleAlarmTick, handleManualHibernate } from './hibernation'
import { createContextMenus } from './contextMenus'
import { ensureHibernateAlarm } from './alarms'
import { ALARM_NAME, AI_CONFIDENCE_THRESHOLD, AI_WAKE_SIGNAL_WINDOW_MS } from '../shared/constants'
import { captureAndStore } from './thumbnail'
import { deleteThumbnail } from './idb'
import { ensureOffscreen } from './classifier'
import { recordKeepAlive, recordTabActivation, closeTabVisit, recordWakeMisclassification } from './ai-learning'
import type { ClassificationResult } from '../shared/types'

// IMPORTANT: Call ensureHibernateAlarm() at module top level so it runs on
// EVERY SW restart, not just on install events. This prevents hibernation from
// silently stopping if the alarm is ever cleared (RESEARCH.md Pitfall 1).
ensureHibernateAlarm()

// Phase 3: Warm up the Offscreen Document on every SW boot so the first alarm tick
// finds an already-initialized ORT session. Idempotent — ensureOffscreen() checks
// chrome.runtime.getContexts() before creating (T-03-09 promise guard).
ensureOffscreen().catch((err) => console.error('[smart-hibernator] offscreen init failed', err))

// Phase 3: Track the currently-active tabId per window so we can close the prior
// visit window when a new tab becomes active. Module-level to survive across events.
let lastActiveTabId: number | null = null

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      hibernation_enabled: true,
      hibernated_count: 0,
      tab_meta: {},
      protected_tabs: [],
      protected_domains: [],
      timeout_minutes: 45,
      hibernation_events: [],
      ai_install_date: Date.now(),    // Phase 3: cold-start countdown start (FR-06)
      ai_classifications: {},          // Phase 3: per-tab classification cache (FR-07)
    })
  } else if (reason === 'update') {
    // Only backfill keys that do not yet exist — avoid wiping user data on update
    chrome.storage.local.get(
      [
        'hibernation_enabled', 'protected_tabs', 'protected_domains',
        'timeout_minutes', 'hibernation_events',
        'ai_install_date', 'ai_classifications',  // Phase 3 backfill
      ],
      (existing) => {
        const defaults: Record<string, unknown> = {}
        if (existing['hibernation_enabled'] === undefined) defaults['hibernation_enabled'] = true
        if (existing['protected_tabs'] === undefined) defaults['protected_tabs'] = []
        if (existing['protected_domains'] === undefined) defaults['protected_domains'] = []
        if (existing['timeout_minutes'] === undefined) defaults['timeout_minutes'] = 45
        if (existing['hibernation_events'] === undefined) defaults['hibernation_events'] = []
        if (existing['ai_install_date'] === undefined) defaults['ai_install_date'] = Date.now()
        if (existing['ai_classifications'] === undefined) defaults['ai_classifications'] = {}
        if (Object.keys(defaults).length > 0) chrome.storage.local.set(defaults)
      }
    )
  }
  createContextMenus()
  ensureHibernateAlarm()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    handleAlarmTick().catch((err) => console.error('[smart-hibernator] alarm tick failed', err))
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const now = Date.now()

  // Existing storage write — preserve as-is
  chrome.storage.local.get('tab_meta', (result) => {
    const tab_meta = (result.tab_meta as Record<number, { lastActiveAt: number; lastFormActivity?: number }>) || {}
    tab_meta[tabId] = { ...tab_meta[tabId], lastActiveAt: now }
    chrome.storage.local.set({ tab_meta })
  })

  // Phase 3: Close previous tab's visit window before opening the new one
  if (lastActiveTabId !== null && lastActiveTabId !== tabId) {
    const prevTabId = lastActiveTabId
    chrome.storage.local.get('tab_meta', (result) => {
      const meta = (result.tab_meta as Record<number, { lastActiveAt: number; lastFormActivity?: number }>) || {}
      const hadFormActivity = !!(meta[prevTabId]?.lastFormActivity)
      closeTabVisit(prevTabId, hadFormActivity).catch(() => {})
    })
  }
  lastActiveTabId = tabId

  // Phase 3: Record new tab activation (fire-and-forget — get the URL from chrome.tabs)
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return
    recordTabActivation(tabId, now, tab.url)
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Phase 3 (D-09 implicit wake signal): fires on the event where discarded transitions
  // to false. Chrome emits discarded:false on the 'loading' event, NOT on 'complete' —
  // so this check must come BEFORE the status==='complete' early-return guard (CR-02).
  if (changeInfo.discarded === false && tab.url) {
    chrome.storage.local.get('ai_classifications', (r) => {
      const cache = (r['ai_classifications'] as Record<number, ClassificationResult>) ?? {}
      const cached = cache[tabId]
      if (
        cached?.label &&
        cached.confidence >= AI_CONFIDENCE_THRESHOLD &&
        Date.now() - cached.cachedAt < AI_WAKE_SIGNAL_WINDOW_MS
      ) {
        try {
          const domain = new URL(tab.url!).hostname
          if (domain) recordWakeMisclassification(domain).catch(() => {})
        } catch {
          // Invalid URL — skip
        }
      }
    })
  }

  // Only capture when page has finished loading AND the tab is currently active
  // captureVisibleTab is hard-constrained to the active tab — RESEARCH.md Pitfall 2
  if (changeInfo.status !== 'complete') return
  if (!tab.active) return
  if (!tab.url?.startsWith('http')) return
  captureAndStore(tabId, tab.url, tab.windowId).catch((err) =>
    console.error('[smart-hibernator] thumbnail capture failed', err)
  )
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('tab_meta', (result) => {
    const tab_meta = (result.tab_meta as Record<number, unknown>) || {}
    delete tab_meta[tabId]
    chrome.storage.local.set({ tab_meta })
  })
  deleteThumbnail(tabId).catch(() => { /* silently ignore — tab already gone */ })

  // Phase 3: Close the visit window for the removed tab (best-effort — hadFormActivity unknown)
  closeTabVisit(tabId, false).catch(() => {})

  // Phase 3: Reset lastActiveTabId if the removed tab was the last active one
  if (tabId === lastActiveTabId) {
    lastActiveTabId = null
  }
})

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) {
    const tabId = sender.tab.id
    chrome.storage.local.get('tab_meta', (result) => {
      const tab_meta = (result.tab_meta as Record<number, { lastActiveAt: number; lastFormActivity?: number }>) || {}
      tab_meta[tabId] = { ...tab_meta[tabId], lastFormActivity: message.timestamp as number }
      chrome.storage.local.set({ tab_meta })
    })
    return
  }

  if (message.type === 'MANUAL_HIBERNATE' && typeof message.tabId === 'number') {
    handleManualHibernate(message.tabId as number).catch(() => {})
    return
  }

  if (message.type === 'CAPTURE_TAB' && typeof message.tabId === 'number' && typeof message.windowId === 'number') {
    captureAndStore(message.tabId as number, (message.url as string) ?? '', message.windowId as number).catch(() => {})
  }

  // Phase 3 (D-09, D-14, T-03-12): Keep Alive message — explicit Vital signal for domain.
  // Validate all fields before acting (T-03-12 KEEP_ALIVE spoofing mitigation).
  if (
    message.type === 'KEEP_ALIVE' &&
    typeof message.tabId === 'number' &&
    typeof message.domain === 'string' &&
    message.domain.length < 256
  ) {
    recordKeepAlive(message.tabId as number, message.domain as string).catch(() => {})
    return
  }
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'hibernate-tab' && tab?.id) {
    handleManualHibernate(tab.id)
  }
  if (info.menuItemId === 'protect-tab' && tab?.id) {
    // Toggle protection for this tab — popup handles primary UI; context menu convenience shortcut
    chrome.storage.local.get('protected_tabs', (result) => {
      const protected_tabs: number[] = (result.protected_tabs as number[]) || []
      const idx = protected_tabs.indexOf(tab.id!)
      if (idx === -1) {
        protected_tabs.push(tab.id!)
      } else {
        protected_tabs.splice(idx, 1)
      }
      chrome.storage.local.set({ protected_tabs })
    })
  }
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'hibernate-current-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) handleManualHibernate(tab.id)
    })
  }
})
