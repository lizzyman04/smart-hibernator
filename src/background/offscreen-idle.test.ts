// End-to-end regression for UAT gap G-05-1 (NFR-01 gate: offscreen document still present
// after 13 idle minutes with 49 tabs open).
//
// Drives the REAL handleAlarmTick (hibernation.ts) through the REAL classifyBatch
// (classifier.ts) with stateful chrome fakes, across simulated idle minutes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OFFSCREEN_IDLE_MS } from '../shared/constants'

const { countTabHistoryMock, getTabHistoryByDomainMock, getDomainBiasMock, pruneTabHistoryMock } =
  vi.hoisted(() => ({
    countTabHistoryMock: vi.fn(),
    getTabHistoryByDomainMock: vi.fn(),
    getDomainBiasMock: vi.fn(),
    pruneTabHistoryMock: vi.fn(),
  }))

vi.mock('./idb', () => ({
  countTabHistory: countTabHistoryMock,
  getTabHistoryByDomain: getTabHistoryByDomainMock,
  getDomainBias: getDomainBiasMock,
  pruneTabHistory: pruneTabHistoryMock,
}))

import { handleAlarmTick } from './hibernation'

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const MINUTE = 60_000

let store: Record<string, unknown>
let docOpen: boolean
let createCalls: number[]
let closeCalls: number[]
let classifyBatchSends: number[][]

function backgroundTab(id: number): chrome.tabs.Tab {
  return {
    id,
    index: id,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    url: `https://site${id}.example/`,
    status: 'complete',
    audible: false,
  } as chrome.tabs.Tab
}

function buildTabs(): chrome.tabs.Tab[] {
  const tabs: chrome.tabs.Tab[] = []
  for (let id = 1; id <= 48; id++) tabs.push(backgroundTab(id))
  tabs.push({ ...backgroundTab(49), active: true })
  return tabs
}

function installFakes(): void {
  const tabs = buildTabs()

  vi.mocked(chrome.storage.local.get).mockImplementation(((
    keys?: string | string[] | null,
    cb?: (r: Record<string, unknown>) => void
  ) => {
    let picked: Record<string, unknown>
    if (keys == null) picked = { ...store }
    else {
      picked = {}
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (k in store) picked[k] = store[k]
      }
    }
    if (typeof cb === 'function') cb(picked)
    return Promise.resolve(picked)
  }) as never)

  vi.mocked(chrome.storage.local.set).mockImplementation(((items: Record<string, unknown>) => {
    Object.assign(store, items)
    return Promise.resolve()
  }) as never)

  ;(chrome.runtime.getContexts as ReturnType<typeof vi.fn>).mockImplementation(async () =>
    docOpen ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : []
  )
  ;(chrome.offscreen.createDocument as ReturnType<typeof vi.fn>).mockImplementation(async () => {
    docOpen = true
    createCalls.push(Date.now())
  })
  ;(chrome.offscreen.closeDocument as ReturnType<typeof vi.fn>).mockImplementation(async () => {
    docOpen = false
    closeCalls.push(Date.now())
  })

  vi.mocked(chrome.runtime.sendMessage).mockImplementation((async (message: {
    type: string
    tabs?: Array<{ tabId: number }>
  }) => {
    if (message.type === 'CLASSIFY_BATCH') {
      if (!docOpen) throw new Error('Could not establish connection. Receiving end does not exist.')
      const ids = (message.tabs ?? []).map((t) => t.tabId)
      classifyBatchSends.push(ids)
      return {
        results: ids.map((tabId) => ({ tabId, label: 'Semi-Active', confidence: 0.7 })),
      }
    }
    if (message.type === 'RELEASE_SESSION') return { ok: true }
    return undefined
  }) as never)

  vi.mocked(chrome.tabs.query).mockImplementation((async () => tabs) as never)
  vi.mocked(chrome.tabs.discard).mockResolvedValue(undefined as never)
}

async function tick(): Promise<void> {
  await handleAlarmTick()
}

async function idleMinute(): Promise<void> {
  await vi.advanceTimersByTimeAsync(MINUTE)
  await tick()
}

function seedStore(): void {
  const tabMeta: Record<number, { lastActiveAt: number }> = {}
  for (let id = 1; id <= 49; id++) tabMeta[id] = { lastActiveAt: T0 - 2 * 60 * MINUTE }
  store = {
    hibernation_enabled: true,
    timeout_minutes: 100000,
    tab_meta: tabMeta,
    protected_tabs: [],
    protected_domains: [],
    ai_classifications: {},
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.clearAllMocks()

  docOpen = false
  createCalls = []
  closeCalls = []
  classifyBatchSends = []
  seedStore()

  countTabHistoryMock.mockResolvedValue(60)
  getTabHistoryByDomainMock.mockResolvedValue([
    {
      domain: 'x',
      url: 'https://x/',
      visitStart: T0 - 60 * MINUTE,
      visitEnd: T0 - 58 * MINUTE,
      dwellMs: 120_000,
      hadFormActivity: false,
      timestamp: T0 - 60 * MINUTE,
    },
  ])
  getDomainBiasMock.mockResolvedValue(undefined)
  pruneTabHistoryMock.mockResolvedValue(undefined)

  installFakes()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('G-05-1: idle browser past cold start', () => {
  it('sends CLASSIFY_BATCH once, then tears the offscreen document down and keeps it down', async () => {
    await tick() // t0: first burst
    for (let i = 0; i < 13; i++) await idleMinute()

    // Asserted first so the failure message exposes the per-tick send count.
    expect(classifyBatchSends.length).toBe(1)
    expect(createCalls.length).toBe(1)
    expect(closeCalls.length).toBe(1)
    expect(closeCalls[0]).toBeGreaterThanOrEqual(T0 + OFFSCREEN_IDLE_MS)
    expect(docOpen).toBe(false)
    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it('activity resumes: a tab activation re-infers the whole batch and recreates the document on demand', async () => {
    await tick()
    for (let i = 0; i < 13; i++) await idleMinute()
    expect(closeCalls.length).toBe(1)
    expect(docOpen).toBe(false)

    const meta = store['tab_meta'] as Record<number, { lastActiveAt: number }>
    meta[5] = { lastActiveAt: Date.now() }

    await tick()
    expect(classifyBatchSends.length).toBe(2)
    expect([...classifyBatchSends[1]].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 48 }, (_, i) => i + 1)
    )
    expect(createCalls.length).toBe(2)

    for (let i = 0; i < 11; i++) await idleMinute()
    expect(closeCalls.length).toBe(2)
    expect(docOpen).toBe(false)
  })

  it('wake-window proxy: cachedAt follows each tick while inferredAt holds at t0', async () => {
    await tick()
    for (let i = 0; i < 3; i++) {
      await idleMinute()
      const cache = store['ai_classifications'] as Record<
        number,
        { cachedAt: number; inferredAt?: number }
      >
      expect(cache[1].cachedAt).toBe(Date.now())
      expect(cache[1].inferredAt).toBe(T0)
    }
  })
})
