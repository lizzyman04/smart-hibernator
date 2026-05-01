import { useEffect, useState } from 'react'
import { Moon, Loader2 } from 'lucide-react'
import { Switch } from '../components/ui/switch'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'

interface PopupState {
  hibernationEnabled: boolean
  hibernatedCount: number
  isCurrentTabProtected: boolean
  isCurrentTabDiscarded: boolean
  currentTabId: number | null
  isHibernating: boolean
}

export default function App() {
  const [state, setState] = useState<PopupState>({
    hibernationEnabled: true,
    hibernatedCount: 0,
    isCurrentTabProtected: false,
    isCurrentTabDiscarded: false,
    currentTabId: null,
    isHibernating: false,
  })

  useEffect(() => {
    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return
      const tabId = tab.id
      const isDiscarded = tab.discarded ?? false

      // Read all relevant storage in one call
      chrome.storage.local.get(
        ['hibernation_enabled', 'hibernated_count', 'protected_tabs'],
        (result) => {
          const hibernationEnabled = (result['hibernation_enabled'] as boolean) ?? true
          const hibernatedCount = (result['hibernated_count'] as number) ?? 0
          const protectedTabs = (result['protected_tabs'] as number[]) ?? []
          const isProtected = protectedTabs.includes(tabId)

          setState((prev) => ({
            ...prev,
            hibernationEnabled,
            hibernatedCount,
            isCurrentTabProtected: isProtected,
            isCurrentTabDiscarded: isDiscarded,
            currentTabId: tabId,
          }))
        }
      )
    })

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

      if (Object.keys(updates).length > 0) {
        setState((prev) => ({ ...prev, ...updates }))
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  function handleGlobalToggle(checked: boolean) {
    chrome.storage.local.set({ hibernation_enabled: checked })
    setState((prev) => ({ ...prev, hibernationEnabled: checked }))
  }

  async function handleHibernateClick() {
    if (!state.currentTabId || state.isCurrentTabDiscarded || state.isCurrentTabProtected) return

    setState((prev) => ({ ...prev, isHibernating: true }))

    try {
      const discarded = await chrome.tabs.discard(state.currentTabId)
      if (discarded !== undefined) {
        const result = await chrome.storage.local.get('hibernated_count')
        const currentCount = (result['hibernated_count'] as number) ?? 0
        const newCount = currentCount + 1
        await chrome.storage.local.set({ hibernated_count: newCount })
        await chrome.action.setBadgeText({ text: newCount > 0 ? String(newCount) : '' })
        await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' })
        setState((prev) => ({
          ...prev,
          hibernatedCount: newCount,
          isCurrentTabDiscarded: true,
          isHibernating: false,
        }))
      } else {
        setState((prev) => ({ ...prev, isHibernating: false, isCurrentTabDiscarded: true }))
      }
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

  const hibernateButtonDisabled =
    state.isHibernating || state.isCurrentTabDiscarded || state.isCurrentTabProtected

  function getHibernateButtonLabel(): string {
    if (state.isHibernating) return 'Hibernating...'
    if (state.isCurrentTabDiscarded) return 'Already hibernated'
    if (state.isCurrentTabProtected) return 'Tab is protected'
    return 'Hibernate this tab'
  }

  return (
    <div className="w-80 p-6 flex flex-col gap-4 bg-zinc-950 min-h-fit">
      {/* Header */}
      <div className="flex items-center gap-2">
        <img
          src="../../icons/icon48.png"
          alt="Smart Hibernator"
          className="w-5 h-5"
        />
        <span className="text-base font-semibold text-zinc-50">Smart Hibernator</span>
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Global Hibernation Toggle */}
      <div className="flex items-center justify-between min-h-11">
        <div className="flex flex-col">
          <span className="text-sm font-normal text-zinc-50">Hibernation</span>
          <span className="text-xs font-normal text-zinc-400 mt-0.5">
            Auto-sleep inactive tabs
          </span>
        </div>
        <Switch
          checked={state.hibernationEnabled}
          onCheckedChange={handleGlobalToggle}
          className="data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700"
        />
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Hibernate This Tab Button */}
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

      {/* Protect This Tab Toggle */}
      <div className="flex items-center justify-between min-h-11">
        <div className="flex flex-col">
          <span className="text-sm font-normal text-zinc-50">Protect this tab</span>
          <span className="text-xs font-normal text-zinc-400 mt-0.5">
            Exclude from auto-hibernation
          </span>
        </div>
        <Switch
          checked={state.isCurrentTabProtected}
          onCheckedChange={handleProtectToggle}
          className="data-[state=checked]:bg-amber-400 data-[state=unchecked]:bg-zinc-700"
        />
      </div>

      <Separator className="bg-zinc-800 h-px w-full" />

      {/* Hibernated Count Display */}
      <div className="bg-zinc-900 rounded-lg p-4 flex flex-col items-center">
        {state.hibernatedCount === 0 ? (
          <span className="text-sm font-normal text-zinc-400">No tabs hibernated</span>
        ) : (
          <>
            <span className="text-3xl font-semibold text-amber-400">
              {state.hibernatedCount}
            </span>
            <span className="text-xs font-normal text-zinc-400 mt-1">tabs hibernated</span>
          </>
        )}
      </div>
    </div>
  )
}
