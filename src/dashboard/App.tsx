import { useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Slider } from '../components/ui/slider'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import {
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { HibernationEvent } from '../shared/types'
import { RAM_PER_TAB_MB } from '../shared/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardState {
  hibernatedCount: number
  hibernationEvents: HibernationEvent[]
  timeoutMinutes: number
  protectedDomains: string[]
  domainInput: string
  domainError: string
  isRefreshing: boolean
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function buildChartData(events: HibernationEvent[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const counts: Record<string, number> = {}
  for (const e of events) {
    if (e.timestamp < cutoff) continue
    const day = days[new Date(e.timestamp).getDay()]
    counts[day] = (counts[day] ?? 0) + 1
  }
  return days.map((day) => ({ day, count: counts[day] ?? 0 }))
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function App() {
  const [state, setState] = useState<DashboardState>({
    hibernatedCount: 0,
    hibernationEvents: [],
    timeoutMinutes: 45,
    protectedDomains: [],
    domainInput: '',
    domainError: '',
    isRefreshing: false,
  })

  useEffect(() => {
    // Poll storage on mount (D-09)
    chrome.storage.local.get(
      ['hibernated_count', 'hibernation_events', 'timeout_minutes', 'protected_domains'],
      (result) => {
        setState((prev) => ({
          ...prev,
          hibernatedCount: (result['hibernated_count'] as number) ?? 0,
          hibernationEvents: (result['hibernation_events'] as HibernationEvent[]) ?? [],
          timeoutMinutes: (result['timeout_minutes'] as number) ?? 45,
          protectedDomains: (result['protected_domains'] as string[]) ?? [],
        }))
      }
    )

    // Subscribe to live storage changes (D-09)
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const updates: Partial<DashboardState> = {}
      if ('hibernated_count' in changes)
        updates.hibernatedCount = changes['hibernated_count'].newValue as number
      if ('hibernation_events' in changes)
        updates.hibernationEvents = changes['hibernation_events'].newValue as HibernationEvent[]
      if ('timeout_minutes' in changes)
        updates.timeoutMinutes = changes['timeout_minutes'].newValue as number
      if ('protected_domains' in changes)
        updates.protectedDomains = changes['protected_domains'].newValue as string[]
      if (Object.keys(updates).length > 0)
        setState((prev) => ({ ...prev, ...updates }))
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleTimeoutCommit(vals: number[]) {
    // onValueCommit fires only when the user releases the slider thumb — D-09 pattern
    chrome.storage.local.set({ timeout_minutes: vals[0] })
  }

  function handleAddDomain() {
    const domain = state.domainInput.trim().replace(/^https?:\/\//, '').trim()
    if (!domain) {
      setState((prev) => ({ ...prev, domainError: 'Please enter a domain.' }))
      return
    }
    if (state.protectedDomains.includes(domain)) {
      setState((prev) => ({ ...prev, domainError: 'Domain already protected.' }))
      return
    }
    const updated = [...state.protectedDomains, domain]
    chrome.storage.local.set({ protected_domains: updated })
    setState((prev) => ({ ...prev, protectedDomains: updated, domainInput: '', domainError: '' }))
  }

  function handleRemoveDomain(domain: string) {
    const updated = state.protectedDomains.filter((d) => d !== domain)
    chrome.storage.local.set({ protected_domains: updated })
    setState((prev) => ({ ...prev, protectedDomains: updated }))
  }

  async function handleRefreshThumbnails() {
    setState((prev) => ({ ...prev, isRefreshing: true }))
    try {
      const discardedTabs = await chrome.tabs.query({ discarded: true })
      await Promise.all(
        discardedTabs.map((tab) => {
          if (!tab.id || !tab.windowId) return Promise.resolve()
          return chrome.runtime.sendMessage({
            type: 'CAPTURE_TAB',
            tabId: tab.id,
            windowId: tab.windowId,
          }).catch(() => { /* tab may have been restored */ })
        })
      )
    } catch {
      // silently continue — dashboard UI should not error on refresh failure
    } finally {
      setState((prev) => ({ ...prev, isRefreshing: false }))
    }
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const ramFreedMB = state.hibernatedCount * RAM_PER_TAB_MB
  const chartData = buildChartData(state.hibernationEvents)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans">
      <div className="max-w-3xl mx-auto px-8 py-8">

        {/* Tab bar (D-07) */}
        <Tabs defaultValue="stats">
          <TabsList className="bg-zinc-900 border border-white/10 rounded-lg p-1 flex gap-1 w-fit">
            <TabsTrigger
              value="stats"
              className="px-4 py-2 text-sm font-normal text-zinc-400 data-[state=active]:bg-zinc-950 data-[state=active]:text-zinc-50 data-[state=active]:font-semibold data-[state=active]:rounded-md data-[state=active]:shadow-sm hover:text-zinc-50"
            >
              Stats
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="px-4 py-2 text-sm font-normal text-zinc-400 data-[state=active]:bg-zinc-950 data-[state=active]:text-zinc-50 data-[state=active]:font-semibold data-[state=active]:rounded-md data-[state=active]:shadow-sm hover:text-zinc-50"
            >
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ── Stats Tab ── */}
          <TabsContent value="stats">

            {/* Hero metric (D-18) — tilde always present */}
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <span className="text-5xl font-semibold text-amber-400 tabular-nums">
                ~{ramFreedMB} MB
              </span>
              <span className="text-sm font-normal text-zinc-400">freed this session</span>

              {/* Sub-stats row */}
              <div className="flex items-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl font-semibold text-zinc-50 tabular-nums">
                    {state.hibernatedCount}
                  </span>
                  <span className="text-xs font-normal text-zinc-400">tabs hibernated</span>
                </div>
              </div>
            </div>

            {/* Recharts timeline chart (D-07, D-08) */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-zinc-50 mb-4">Last 7 Days</h2>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#A1A1AA', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#18181B',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: '#FAFAFA', fontSize: '12px' }}
                    itemStyle={{ color: '#A1A1AA', fontSize: '12px' }}
                    formatter={(value: number) => [`${value} tabs`, 'Hibernated']}
                  />
                  <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Refresh thumbnails button (D-14) */}
            <div className="flex justify-end mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshThumbnails}
                disabled={state.isRefreshing}
                className="bg-zinc-800 border border-zinc-700 text-zinc-50 hover:bg-zinc-700 text-xs font-normal"
              >
                {state.isRefreshing ? (
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-2" />
                )}
                {state.isRefreshing ? 'Refreshing...' : 'Refresh thumbnails'}
              </Button>
            </div>

          </TabsContent>

          {/* ── Settings Tab ── */}
          <TabsContent value="settings">

            {/* Timeout slider (D-10) */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-white/10 mt-4">
              <h2 className="text-xl font-semibold text-zinc-50">Inactivity Timeout</h2>
              <p className="text-xs font-normal text-zinc-400 mt-1 mb-6">
                Hibernate tabs after this many minutes of inactivity.
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  min={5}
                  max={240}
                  step={5}
                  value={[state.timeoutMinutes]}
                  onValueChange={(vals) =>
                    setState((prev) => ({ ...prev, timeoutMinutes: vals[0] }))
                  }
                  onValueCommit={handleTimeoutCommit}
                  className="flex-1"
                />
                <span className="text-sm font-semibold text-zinc-50 w-24 text-right tabular-nums">
                  {state.timeoutMinutes} minutes
                </span>
              </div>
            </div>

            {/* Domain whitelist (D-11) */}
            <div className="bg-zinc-900 rounded-xl p-6 border border-white/10 mt-4">
              <h2 className="text-xl font-semibold text-zinc-50">Protected Domains</h2>
              <p className="text-xs font-normal text-zinc-400 mt-1 mb-4">
                Tabs on these domains are never hibernated.
              </p>

              {/* Add domain row */}
              <div className="flex items-center gap-2">
                <Input
                  value={state.domainInput}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      domainInput: e.target.value,
                      domainError: '',
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddDomain()
                  }}
                  placeholder="e.g. github.com"
                  className={[
                    'bg-zinc-950 border-zinc-700 text-zinc-50 text-sm h-9 flex-1 placeholder:text-zinc-600',
                    state.domainError ? 'border-red-500 focus-visible:ring-red-500' : '',
                  ].join(' ')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddDomain}
                  disabled={!state.domainInput.trim()}
                  className="h-9 px-3 bg-zinc-800 border-zinc-700 text-zinc-50 hover:bg-zinc-700 text-sm"
                >
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Add Domain
                </Button>
              </div>

              {/* Validation error */}
              {state.domainError && (
                <p className="text-xs text-red-400 mt-1">{state.domainError}</p>
              )}

              {/* Domain chips */}
              {state.protectedDomains.length === 0 ? (
                <p className="text-xs text-zinc-400 italic mt-3">No protected domains yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3">
                  {state.protectedDomains.map((domain) => (
                    <Badge
                      key={domain}
                      variant="secondary"
                      className="h-7 px-2 bg-zinc-800 border border-zinc-700 text-zinc-50 text-xs font-normal flex items-center gap-2 rounded-full"
                    >
                      <span className="truncate max-w-[160px]">{domain}</span>
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        aria-label={`Remove ${domain}`}
                        className="text-zinc-400 hover:text-red-400 flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
