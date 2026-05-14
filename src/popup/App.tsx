import { useEffect, useState } from 'react'
import { Moon, Loader2, Globe, ExternalLink, Shield } from 'lucide-react'
import { Switch } from '../components/ui/switch'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { getThumbnail, deleteThumbnail } from '../background/idb'
import type { ClassificationResult } from '../shared/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface HibernatedTabRow {
  id: number
  title: string
  url: string
  domain: string
  favIconUrl: string | undefined
  dataUrl: string | undefined
  classification: ClassificationResult | undefined
}

interface PopupState {
  hibernationEnabled: boolean
  hibernatedCount: number
  isCurrentTabProtected: boolean
  isCurrentTabDiscarded: boolean
  currentTabId: number | null
  isHibernating: boolean
  hibernatedTabs: HibernatedTabRow[]
  wakingTabId: number | null
  aiClassifications: Record<number, ClassificationResult>
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState<PopupState>({
    hibernationEnabled: true,
    hibernatedCount: 0,
    isCurrentTabProtected: false,
    isCurrentTabDiscarded: false,
    currentTabId: null,
    isHibernating: false,
    hibernatedTabs: [],
    wakingTabId: null,
    aiClassifications: {},
  })

  useEffect(() => {
    // Get current tab info + storage in one batch
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return
      const tabId = tab.id
      const isDiscarded = tab.discarded ?? false

      chrome.storage.local.get(
        ['hibernation_enabled', 'hibernated_count', 'protected_tabs', 'ai_classifications'],
        (result) => {
          const hibernationEnabled = (result['hibernation_enabled'] as boolean) ?? true
          const hibernatedCount = (result['hibernated_count'] as number) ?? 0
          const protectedTabs = (result['protected_tabs'] as number[]) ?? []
          const isProtected = protectedTabs.includes(tabId)
          const aiClassifications = (result['ai_classifications'] as Record<number, ClassificationResult>) ?? {}

          setState((prev) => ({
            ...prev,
            hibernationEnabled,
            hibernatedCount,
            isCurrentTabProtected: isProtected,
            isCurrentTabDiscarded: isDiscarded,
            currentTabId: tabId,
            aiClassifications,
          }))
        }
      )
    })

    // Load hibernated tab list (FR-09) — reads ai_classifications from storage to attach classification per row
    async function loadHibernatedTabs() {
      const discardedTabs = await chrome.tabs.query({ discarded: true })

      // Fetch ai_classifications fresh to avoid race with the current-tab storage.get above
      const storageResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get('ai_classifications', (result) => resolve(result))
      })
      const aiClassifications = (storageResult['ai_classifications'] as Record<number, ClassificationResult>) ?? {}

      const rows: HibernatedTabRow[] = await Promise.all(
        discardedTabs.map(async (tab) => {
          const record = tab.id ? await getThumbnail(tab.id) : undefined
          return {
            id: tab.id!,
            title: tab.title ?? 'Unknown Tab',
            url: tab.url ?? '',
            domain: tab.url ? (() => { try { return new URL(tab.url!).hostname } catch { return '' } })() : '',
            favIconUrl: tab.favIconUrl,
            dataUrl: record?.dataUrl,
            classification: aiClassifications[tab.id!],
          }
        })
      )
      setState((prev) => ({ ...prev, hibernatedTabs: rows, aiClassifications }))
    }
    loadHibernatedTabs().catch(() => { /* silently ignore — popup closed before query resolves */ })

    // Subscribe to storage changes for live updates
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const updates: Partial<PopupState> = {}

      if ('hibernation_enabled' in changes) {
        updates.hibernationEnabled = changes['hibernation_enabled'].newValue as boolean
      }
      if ('hibernated_count' in changes) {
        updates.hibernatedCount = changes['hibernated_count'].newValue as number
      }
      if ('protected_tabs' in changes) {
        setState((prev) => {
          const protectedTabs = (changes['protected_tabs'].newValue as number[]) ?? []
          return {
            ...prev,
            isCurrentTabProtected: prev.currentTabId !== null
              ? protectedTabs.includes(prev.currentTabId)
              : false,
          }
        })
      }
      if ('ai_classifications' in changes) {
        const aiClassifications = (changes['ai_classifications'].newValue as Record<number, ClassificationResult>) ?? {}
        setState((prev) => ({
          ...prev,
          aiClassifications,
          hibernatedTabs: prev.hibernatedTabs.map((t) => ({
            ...t,
            classification: aiClassifications[t.id],
          })),
        }))
      }

      if (Object.keys(updates).length > 0) {
        setState((prev) => ({ ...prev, ...updates }))
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleGlobalToggle(checked: boolean) {
    chrome.storage.local.set({ hibernation_enabled: checked })
    setState((prev) => ({ ...prev, hibernationEnabled: checked }))
  }

  async function handleHibernateClick() {
    if (!state.currentTabId || state.isCurrentTabDiscarded || state.isCurrentTabProtected) return
    setState((prev) => ({ ...prev, isHibernating: true }))
    try {
      await chrome.runtime.sendMessage({ type: 'MANUAL_HIBERNATE', tabId: state.currentTabId })
      setState((prev) => ({ ...prev, isCurrentTabDiscarded: true, isHibernating: false }))
    } catch {
      setState((prev) => ({ ...prev, isHibernating: false }))
    }
  }

  function handleProtectToggle(checked: boolean) {
    if (!state.currentTabId) return
    chrome.storage.local.get('protected_tabs', (result) => {
      const protectedTabs: number[] = (result['protected_tabs'] as number[]) ?? []
      const idx = protectedTabs.indexOf(state.currentTabId!)
      if (checked && idx === -1) {
        protectedTabs.push(state.currentTabId!)
      } else if (!checked && idx !== -1) {
        protectedTabs.splice(idx, 1)
      }
      chrome.storage.local.set({ protected_tabs: protectedTabs })
      setState((prev) => ({ ...prev, isCurrentTabProtected: checked }))
    })
  }

  async function handleWakeTab(tabId: number) {
    setState((prev) => ({ ...prev, wakingTabId: tabId }))
    try {
      await chrome.tabs.update(tabId, { active: true })
      await deleteThumbnail(tabId)
      setState((prev) => ({
        ...prev,
        wakingTabId: null,
        hibernatedTabs: prev.hibernatedTabs.filter((t) => t.id !== tabId),
      }))
    } catch {
      setState((prev) => ({ ...prev, wakingTabId: null }))
    }
  }

  function handleKeepAlive(tabId: number, domain: string): void {
    chrome.runtime.sendMessage({ type: 'KEEP_ALIVE', tabId, domain }).catch(() => {})
  }

  function handleOpenDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') })
  }

  const hibernateButtonDisabled =
    state.isHibernating || state.isCurrentTabDiscarded || state.isCurrentTabProtected

  function getHibernateButtonLabel(): string {
    if (state.isHibernating) return 'Hibernating...'
    if (state.isCurrentTabDiscarded) return 'Already hibernated'
    if (state.isCurrentTabProtected) return 'Tab is protected'
    return 'Hibernate this tab'
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-80 p-6 flex flex-col gap-4 bg-zinc-950 min-h-fit">

      {/* Header — text-xl per UI-SPEC §2 (was text-base in Phase 1) */}
      <div className="flex items-center gap-2">
        <img src="../../icons/icon48.png" alt="Smart Hibernator" className="w-5 h-5" />
        <span className="text-xl font-semibold text-zinc-50">Smart Hibernator</span>
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Global Hibernation Toggle (Phase 1 — unchanged) */}
      <div className="flex items-center justify-between min-h-11">
        <div className="flex flex-col">
          <span className="text-sm font-normal text-zinc-50">Hibernation</span>
          <span className="text-xs font-normal text-zinc-400 mt-0.5">Auto-sleep inactive tabs</span>
        </div>
        <Switch
          checked={state.hibernationEnabled}
          onCheckedChange={handleGlobalToggle}
          className="data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700"
        />
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Hibernate This Tab Button (Phase 1 — unchanged) */}
      <Button
        onClick={handleHibernateClick}
        disabled={hibernateButtonDisabled}
        className="w-full min-h-11 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 active:bg-zinc-600 text-sm font-normal"
        variant="outline"
      >
        {state.isHibernating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Moon className="w-4 h-4 mr-2" />
        )}
        {getHibernateButtonLabel()}
      </Button>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Protect This Tab Toggle (Phase 1 — unchanged) */}
      <div className="flex items-center justify-between min-h-11">
        <div className="flex flex-col">
          <span className="text-sm font-normal text-zinc-50">Protect this tab</span>
          <span className="text-xs font-normal text-zinc-400 mt-0.5">Exclude from auto-hibernation</span>
        </div>
        <Switch
          checked={state.isCurrentTabProtected}
          onCheckedChange={handleProtectToggle}
          className="data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700"
        />
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Hibernated Tab List (FR-09, D-03) */}
      <div className="flex flex-col overflow-y-auto max-h-[220px]">
        {state.hibernatedTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <span className="text-sm font-normal text-zinc-50">No hibernated tabs</span>
            <span className="text-xs font-normal text-zinc-400">
              Tabs you hibernate will appear here.
            </span>
          </div>
        ) : (
          state.hibernatedTabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-2 min-h-16 py-2 border-b border-white/10 hover:bg-white/5"
            >
              {/* Thumbnail cell — State A (has image) or State B (fallback card) */}
              <div className="w-20 h-12 rounded overflow-hidden shrink-0 bg-zinc-800">
                {tab.dataUrl ? (
                  <img src={tab.dataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-20 h-12 rounded bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col items-center justify-center gap-1">
                    {tab.favIconUrl && (tab.favIconUrl.startsWith('data:') || tab.favIconUrl.startsWith('chrome-extension://')) ? (
                      <img src={tab.favIconUrl} className="w-4 h-4 rounded-sm" alt="" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    <span className="text-xs font-normal text-zinc-500 truncate max-w-[68px]">
                      {tab.domain}
                    </span>
                  </div>
                )}
              </div>

              {/* Title + domain */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <span className="text-sm font-normal text-zinc-50 truncate">{tab.title}</span>
                <span className="text-xs font-normal text-zinc-400 truncate">{tab.domain}</span>
              </div>

              {/* V/S/D pill badge — T-03-16 strict switch; no pill on null/undefined (D-12) */}
              {tab.classification?.label === 'Vital' && (
                <Badge
                  className={cn(
                    'h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-semibold shrink-0',
                    'bg-green-600 border-green-500 text-white'
                  )}
                  title="Vital"
                >
                  V
                </Badge>
              )}
              {tab.classification?.label === 'Semi-Active' && (
                <Badge
                  className={cn(
                    'h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-semibold shrink-0',
                    'bg-amber-500 border-amber-400 text-white'
                  )}
                  title="Semi-Active"
                >
                  S
                </Badge>
              )}
              {tab.classification?.label === 'Dead' && (
                <Badge
                  className={cn(
                    'h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px] font-semibold shrink-0',
                    'bg-zinc-600 border-zinc-500 text-zinc-300'
                  )}
                  title="Dead"
                >
                  D
                </Badge>
              )}

              {/* Keep Alive button — FR-06/D-14; distinct from Wake Tab (T-03-18) */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleKeepAlive(tab.id, tab.domain)}
                className="h-8 px-2 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-green-900 active:bg-green-800 text-xs font-normal shrink-0"
                title="Mark as important — teaches AI this domain is vital"
                aria-label={`Keep alive ${tab.domain}`}
              >
                <Shield className="w-3 h-3" /> Keep
              </Button>

              {/* Wake Tab button */}
              <Button
                variant="outline"
                size="sm"
                disabled={state.wakingTabId === tab.id}
                onClick={() => handleWakeTab(tab.id)}
                className="h-8 px-3 bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 active:bg-zinc-600 text-xs font-normal shrink-0"
              >
                {state.wakingTabId === tab.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Wake Tab'
                )}
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Hibernated Count Display (Phase 1 retained — text-xl per UI-SPEC §10, was text-3xl) */}
      <div className="bg-zinc-900 rounded-lg p-4 flex flex-col items-center">
        {state.hibernatedCount === 0 ? (
          <span className="text-sm font-normal text-zinc-400">No tabs hibernated</span>
        ) : (
          <>
            <span className="text-xl font-semibold text-amber-400 tabular-nums">
              {state.hibernatedCount}
            </span>
            <span className="text-xs font-normal text-zinc-400 mt-1">tabs hibernated</span>
          </>
        )}
      </div>

      {/* Dashboard footer link (D-05) */}
      <div className="flex items-center justify-center pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenDashboard}
          className="text-xs font-normal text-zinc-400 hover:text-zinc-50 gap-1"
        >
          Dashboard
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>

    </div>
  )
}
