// End-to-end regression for UAT gap G-05-1 (NFR-01 gate: offscreen document still present
// after 13 idle minutes with 49 tabs open).
//
// Drives the REAL handleAlarmTick (hibernation.ts) through the REAL classifyBatch
// (classifier.ts) and the REAL index.ts alarm routing, with stateful chrome fakes, across
// simulated idle minutes and simulated service-worker restarts.
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
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
  putTabState: vi.fn().mockResolvedValue(undefined),
  getTabState: vi.fn().mockResolvedValue(undefined),
  deleteTabState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./thumbnail', () => ({ captureAndStore: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./ai-learning', () => ({
  recordKeepAlive: vi.fn().mockResolvedValue(undefined),
  recordTabActivation: vi.fn(),
  closeTabVisit: vi.fn().mockResolvedValue(undefined),
  recordWakeMisclassification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./contextMenus', () => ({ createContextMenus: vi.fn() }))
vi.mock('./alarms', () => ({ ensureHibernateAlarm: vi.fn().mockResolvedValue(undefined) }))

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const MINUTE = 60_000

let store: Record<string, unknown>
let docOpen: boolean
let createCalls: number[]
let closeCalls: number[]
let classifyBatchSends: number[][]
// Alarms outlive a service-worker instance, so the scheduler lives outside module state.
let alarmSchedule: Map<string, number>
let currentTick: () => Promise<void>

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

  vi.mocked(chrome.alarms.create).mockImplementation(((
    name: string,
    info: { when?: number; delayInMinutes?: number }
  ) => {
    const when = info.when ?? Date.now() + (info.delayInMinutes ?? 0) * MINUTE
    alarmSchedule.set(name, when)
    return Promise.resolve()
  }) as never)

  vi.mocked(chrome.tabs.query).mockImplementation((async () => tabs) as never)
  vi.mocked(chrome.tabs.discard).mockResolvedValue(undefined as never)
}

async function flushMicrotasks(): Promise<void> {
  // Bounded loop; vi.waitFor is avoided because it advances fake time.
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** Fire every alarm whose time has come, through the real index.ts onAlarm listener. */
async function fireDueAlarms(): Promise<void> {
  for (const [name, when] of [...alarmSchedule.entries()]) {
    if (when <= Date.now()) {
      alarmSchedule.delete(name)
      ;(chrome.alarms.onAlarm as unknown as { callListeners: (...a: unknown[]) => void }).callListeners({
        name,
        scheduledTime: when,
      })
    }
  }
  await flushMicrotasks()
}

function clearAllSwListeners(): void {
  const events = [
    chrome.runtime.onInstalled,
    chrome.runtime.onMessage,
    chrome.alarms.onAlarm,
    chrome.tabs.onActivated,
    chrome.tabs.onUpdated,
    chrome.tabs.onRemoved,
    chrome.contextMenus.onClicked,
    chrome.commands.onCommand,
  ]
  for (const ev of events) (ev as unknown as { clearListeners: () => void }).clearListeners()
}

/** Boot a fresh service-worker instance: new module registry, index.ts evaluated. */
async function bootSw(): Promise<void> {
  clearAllSwListeners()
  vi.resetModules()
  await import('./index')
  const hibernation = await import('./hibernation')
  currentTick = hibernation.handleAlarmTick
  await flushMicrotasks()
}

/** In-memory SW timers and listeners die with the SW; storage, alarms and the doc persist. */
async function simulateSwRestart(): Promise<void> {
  // clearAllTimers() also resets the fake clock to its install time, so restore it.
  const now = Date.now()
  vi.clearAllTimers()
  vi.setSystemTime(now)
  await bootSw()
}

async function tick(): Promise<void> {
  await currentTick()
  await fireDueAlarms()
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

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.clearAllMocks()

  docOpen = false
  createCalls = []
  closeCalls = []
  classifyBatchSends = []
  alarmSchedule = new Map()
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
  await bootSw()
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

describe('G-05-1: service-worker lifetime', () => {
  it('SW restart: teardown still happens, delivered by the persisted alarm', async () => {
    await tick() // t0: burst in SW instance #1
    await simulateSwRestart() // SW terminated and restarted; in-memory timers are gone
    for (let i = 0; i < 11; i++) await idleMinute()

    expect(closeCalls.length).toBe(1)
    expect(closeCalls[0]).toBeLessThanOrEqual(T0 + OFFSCREEN_IDLE_MS + MINUTE)
    expect(docOpen).toBe(false)
  })

  it('SW boot: importing index.ts never creates the offscreen document', async () => {
    docOpen = false
    createCalls = []
    vi.mocked(chrome.runtime.getContexts).mockClear()
    vi.mocked(chrome.offscreen.createDocument).mockClear()

    await bootSw()

    expect(createCalls.length).toBe(0)
    expect(chrome.runtime.getContexts).not.toHaveBeenCalled()
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
    expect(createCalls.length).toBe(0)
  })
})
