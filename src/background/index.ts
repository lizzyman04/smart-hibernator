// Service Worker entry point
// CRITICAL: ALL listeners registered synchronously at module top level
// Do NOT move any listener registration inside async callbacks
import { handleAlarmTick, handleManualHibernate } from './hibernation'
import { createContextMenus } from './contextMenus'
import { ensureHibernateAlarm } from './alarms'
import { ALARM_NAME } from '../shared/constants'
import { captureAndStore } from './thumbnail'
import { deleteThumbnail } from './idb'

// IMPORTANT: Call ensureHibernateAlarm() at module top level so it runs on
// EVERY SW restart, not just on install events. This prevents hibernation from
// silently stopping if the alarm is ever cleared (RESEARCH.md Pitfall 1).
ensureHibernateAlarm()

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
    })
  } else if (reason === 'update') {
    // Only backfill keys that do not yet exist — avoid wiping user data on update
    chrome.storage.local.get(
      ['hibernation_enabled', 'protected_tabs', 'protected_domains', 'timeout_minutes', 'hibernation_events'],
      (existing) => {
        const defaults: Record<string, unknown> = {}
        if (existing['hibernation_enabled'] === undefined) defaults['hibernation_enabled'] = true
        if (existing['protected_tabs'] === undefined) defaults['protected_tabs'] = []
        if (existing['protected_domains'] === undefined) defaults['protected_domains'] = []
        if (existing['timeout_minutes'] === undefined) defaults['timeout_minutes'] = 45
        if (existing['hibernation_events'] === undefined) defaults['hibernation_events'] = []
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
  chrome.storage.local.get('tab_meta', (result) => {
    const tab_meta = (result.tab_meta as Record<number, { lastActiveAt: number; lastFormActivity?: number }>) || {}
    tab_meta[tabId] = { ...tab_meta[tabId], lastActiveAt: Date.now() }
    chrome.storage.local.set({ tab_meta })
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
})

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'FORM_ACTIVITY' && sender.tab?.id) {
    const tabId = sender.tab.id
    chrome.storage.local.get('tab_meta', (result) => {
      const tab_meta = (result.tab_meta as Record<number, { lastActiveAt: number; lastFormActivity?: number }>) || {}
      tab_meta[tabId] = { ...tab_meta[tabId], lastFormActivity: message.timestamp as number }
      chrome.storage.local.set({ tab_meta })
    })
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
