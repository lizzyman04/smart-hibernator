// Behavioral tests for src/background/classifier.ts — FR-05 / FR-07 / T-03-07 / T-03-09 / D-01 / D-05
// Wave 0 infrastructure checks (constants) are preserved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AI_COLD_START_MIN_SAMPLES,
  AI_CONFIDENCE_THRESHOLD,
} from '../shared/constants'

// Mock idb module so tests control what history and bias values are returned
vi.mock('./idb', () => ({
  countTabHistory: vi.fn(),
  getTabHistoryByDomain: vi.fn(),
  getDomainBias: vi.fn(),
}))

import {
  buildFeaturesForTab,
  classifyBatch,
  ensureOffscreen,
  getDomainCategoryBoost,
  teardownIfIdle,
} from './classifier'
import { countTabHistory, getTabHistoryByDomain, getDomainBias } from './idb'
import type { TabMeta, TabHistoryRecord } from '../shared/types'

// ─── Test data helpers ──────────────────────────────────────────────────────

function makeMeta(overrides: Partial<TabMeta> = {}): TabMeta {
  return { lastActiveAt: Date.now(), ...overrides }
}

function makeHistoryRow(overrides: Partial<TabHistoryRecord> = {}): TabHistoryRecord {
  const now = Date.now()
  return {
    domain: 'example.com',
    url: 'https://example.com',
    visitStart: now - 60_000,
    visitEnd: now,
    dwellMs: 60_000,
    hadFormActivity: false,
    timestamp: now - 60_000,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 0 infrastructure checks (preserved)
// ─────────────────────────────────────────────────────────────────────────────

describe('classifier (FR-05 / FR-07)', () => {
  it('Wave 0 infrastructure check: AI_COLD_START_MIN_SAMPLES is defined and is a positive integer', () => {
    expect(AI_COLD_START_MIN_SAMPLES).toBeGreaterThan(0)
    expect(Number.isInteger(AI_COLD_START_MIN_SAMPLES)).toBe(true)
  })

  it('Wave 0 infrastructure check: AI_CONFIDENCE_THRESHOLD is between 0 and 1', () => {
    expect(AI_CONFIDENCE_THRESHOLD).toBeGreaterThan(0)
    expect(AI_CONFIDENCE_THRESHOLD).toBeLessThan(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getDomainCategoryBoost (D-02)
// ─────────────────────────────────────────────────────────────────────────────

describe('getDomainCategoryBoost (FR-05 + D-02)', () => {
  it('FR-05 + D-02: returns +1 for github.com, 0 for example.com', () => {
    expect(getDomainCategoryBoost('github.com')).toBe(1)
    expect(getDomainCategoryBoost('example.com')).toBe(0)
  })

  it('returns +1 for other VITAL_DOMAINS (docs.google.com, notion.so)', () => {
    expect(getDomainCategoryBoost('docs.google.com')).toBe(1)
    expect(getDomainCategoryBoost('notion.so')).toBe(1)
  })

  it('returns 0 for completely unknown domain', () => {
    expect(getDomainCategoryBoost('totally-unknown-xyz.com')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildFeaturesForTab (FR-05 / FR-07 / T-03-07)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildFeaturesForTab (FR-05 / FR-07 / T-03-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FR-07 cold start: returns null when countTabHistory < AI_COLD_START_MIN_SAMPLES', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(10)

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).toBeNull()
  })

  it('FR-05: returns a 6-element number array when sufficient history exists', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow()])
    vi.mocked(getDomainBias).mockResolvedValue(undefined)

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).not.toBeNull()
    expect(result!.length).toBe(6)
    expect(result!.every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true)
  })

  it('FR-05: normalizes revisitFreq to <= 1 even with 100 history rows', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    // 100 rows — revisitFreq should be capped at 1.0
    vi.mocked(getTabHistoryByDomain).mockResolvedValue(
      Array.from({ length: 100 }, () => makeHistoryRow())
    )
    vi.mocked(getDomainBias).mockResolvedValue(undefined)

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).not.toBeNull()
    expect(result![0]).toBe(1) // revisitFreq capped at 1.0
  })

  it('T-03-07: clamps domainBiasOffset to 1 when biasOffset is 99', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow()])
    vi.mocked(getDomainBias).mockResolvedValue({
      domain: 'example.com',
      biasOffset: 99,
      keepAliveCount: 0,
      misclassificationCount: 0,
      updatedAt: Date.now(),
    })

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).not.toBeNull()
    // Feature index 4 is domainBiasOffset — must be clamped to 1
    expect(result![4]).toBe(1)
  })

  it('T-03-07: clamps domainBiasOffset to -1 when biasOffset is -99', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow()])
    vi.mocked(getDomainBias).mockResolvedValue({
      domain: 'example.com',
      biasOffset: -99,
      keepAliveCount: 0,
      misclassificationCount: 0,
      updatedAt: Date.now(),
    })

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).not.toBeNull()
    expect(result![4]).toBe(-1)
  })

  it('T-03-07: treats NaN biasOffset as 0', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow()])
    vi.mocked(getDomainBias).mockResolvedValue({
      domain: 'example.com',
      biasOffset: NaN,
      keepAliveCount: 0,
      misclassificationCount: 0,
      updatedAt: Date.now(),
    })

    const result = await buildFeaturesForTab(1, 'https://example.com', makeMeta())

    expect(result).not.toBeNull()
    expect(result![4]).toBe(0)
  })

  it('returns null when URL is invalid (try/catch gate)', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)

    const result = await buildFeaturesForTab(1, 'not-a-valid-url', makeMeta())

    expect(result).toBeNull()
  })

  it('formActivity is 1 when meta.lastFormActivity is set', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow()])
    vi.mocked(getDomainBias).mockResolvedValue(undefined)

    const result = await buildFeaturesForTab(
      1,
      'https://example.com',
      makeMeta({ lastFormActivity: Date.now() - 1000 })
    )

    expect(result).not.toBeNull()
    expect(result![2]).toBe(1) // formActivity feature
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyBatch (FR-05 / T-03-06)
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyBatch (FR-05 / T-03-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: enough history for non-cold-start
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow({ domain: 'example.com' })])
    vi.mocked(getDomainBias).mockResolvedValue(undefined)
  })

  it('FR-05: sends CLASSIFY_BATCH message and writes results to ai_classifications', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      results: [{ tabId: 1, label: 'Vital', confidence: 0.9 }],
    })
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ ai_classifications: {} })
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined)
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 } as chrome.tabs.Tab])

    await classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLASSIFY_BATCH' })
    )

    const setArg = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<string, unknown>
    const classifications = setArg['ai_classifications'] as Record<number, { label: string; confidence: number; cachedAt: number }>
    expect(classifications[1]).toBeDefined()
    expect(classifications[1].label).toBe('Vital')
    expect(classifications[1].confidence).toBe(0.9)
    expect(typeof classifications[1].cachedAt).toBe('number')
  })

  it('T-03-06: prunes stale tabIds not in current tab list from cache', async () => {
    // Cache has tabId 999 (stale) and tabId 1 (current)
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      ai_classifications: {
        999: { label: 'Dead', confidence: 0.9, cachedAt: 1000 },
        1: { label: 'Vital', confidence: 0.8, cachedAt: 2000 },
      },
    })
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      results: [{ tabId: 1, label: 'Semi-Active', confidence: 0.7 }],
    })
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined)
    // Only tabId 1 is open — tabId 999 should be pruned
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 } as chrome.tabs.Tab])

    await classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])

    const setArg = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as Record<string, unknown>
    const classifications = setArg['ai_classifications'] as Record<number, unknown>
    expect(classifications[999]).toBeUndefined()
    expect(classifications[1]).toBeDefined()
  })

  it('no-ops when candidateTabs is empty', async () => {
    await classifyBatch([])
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('no-ops when all tabs are in cold start (all buildFeaturesForTab return null)', async () => {
    vi.mocked(countTabHistory).mockResolvedValue(5) // below cold-start threshold
    await classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ensureOffscreen (T-03-09 / RESEARCH Pattern 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureOffscreen (T-03-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('T-03-09: does not create a second document when getContexts returns a non-empty list', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([{} as chrome.runtime.ExtensionContext])

    await ensureOffscreen()
    await ensureOffscreen()

    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('T-03-09: calls createDocument exactly once when getContexts returns empty list', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([])
    vi.mocked(chrome.offscreen.createDocument).mockResolvedValue(undefined)

    await ensureOffscreen()

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1)
    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: [chrome.offscreen.Reason.WORKERS],
      })
    )
  })

  it('T-03-09: guards against concurrent calls — createDocument called exactly once even with parallel invocations', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([])

    // Create a promise that resolves after a tick to simulate async creation
    let resolveCreate!: () => void
    const createPromise = new Promise<void>((res) => { resolveCreate = res })
    vi.mocked(chrome.offscreen.createDocument).mockReturnValue(createPromise as any)

    // Fire two concurrent calls — only the first should call createDocument
    const p1 = ensureOffscreen()
    const p2 = ensureOffscreen()

    resolveCreate()
    await Promise.all([p1, p2])

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D-01 / D-05: Idle teardown timer + pending ref-count guard
// ─────────────────────────────────────────────────────────────────────────────

describe('D-01 / D-05: teardownIfIdle + pending ref-count guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Default: document does not exist (getContexts returns [])
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([])
    vi.mocked(chrome.offscreen.createDocument).mockResolvedValue(undefined)
    vi.mocked(chrome.offscreen.closeDocument).mockResolvedValue(undefined)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true })
    // Default storage mocks for classifyBatch
    vi.mocked(countTabHistory).mockResolvedValue(100)
    vi.mocked(getTabHistoryByDomain).mockResolvedValue([makeHistoryRow({ domain: 'example.com' })])
    vi.mocked(getDomainBias).mockResolvedValue(undefined)
    vi.mocked(chrome.storage.local.get).mockResolvedValue({ ai_classifications: {} })
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined)
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 1 } as chrome.tabs.Tab])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('D-05: teardownIfIdle does NOT call closeDocument when pending > 0', async () => {
    // Start a classifyBatch that is in-flight (blocked on CLASSIFY_BATCH sendMessage).
    // We use a two-step unlock: classifyBatch must pass ensureOffscreen() + feature building
    // and reach pending++ BEFORE teardownIfIdle is called — otherwise pending is still 0.
    let resolveSend!: (v: unknown) => void
    // Signal that classifyBatch has entered the critical section (pending > 0)
    let signalInFlight!: () => void
    const inFlightSignal = new Promise<void>((res) => { signalInFlight = res })

    vi.mocked(chrome.runtime.sendMessage).mockImplementation((msg) => {
      if ((msg as any).type === 'CLASSIFY_BATCH') {
        signalInFlight() // pending++ has already run; now we're inside the critical section
        return new Promise((res) => { resolveSend = res })
      }
      return Promise.resolve({ ok: true })
    })

    const batchPromise = classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])

    // Wait until classifyBatch has entered the critical section (pending++ done)
    await inFlightSignal

    // NOW call teardownIfIdle — pending > 0, should be a no-op
    await teardownIfIdle()

    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled()

    // Resolve the in-flight batch
    resolveSend({ results: [{ tabId: 1, label: 'Vital', confidence: 0.9 }] })
    await batchPromise
  })

  it('D-05: teardownIfIdle calls RELEASE_SESSION + closeDocument when pending === 0', async () => {
    // pending is 0 by default (no classifyBatch in flight)
    await teardownIfIdle()

    // Should have sent RELEASE_SESSION message
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RELEASE_SESSION' })
    )
    // Should have called closeDocument
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1)
  })

  it('D-01: teardownIfIdle does not throw when RELEASE_SESSION sendMessage rejects', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('doc gone'))
    await expect(teardownIfIdle()).resolves.toBeUndefined()
    // closeDocument should still be attempted
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1)
  })

  it('D-01: teardownIfIdle does not throw when closeDocument rejects', async () => {
    vi.mocked(chrome.offscreen.closeDocument).mockRejectedValue(new Error('already closed'))
    await expect(teardownIfIdle()).resolves.toBeUndefined()
  })

  it('D-01: armIdleTeardown fires after OFFSCREEN_IDLE_MS and tears down when idle', async () => {
    const { OFFSCREEN_IDLE_MS } = await import('../shared/constants')

    // Run a classify batch to completion (arms the timer)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      results: [{ tabId: 1, label: 'Vital', confidence: 0.9 }],
    })
    await classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])

    // Timer is armed — advance past OFFSCREEN_IDLE_MS
    vi.advanceTimersByTime(OFFSCREEN_IDLE_MS + 1)
    // Allow microtasks to flush
    await Promise.resolve()
    await Promise.resolve()

    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1)
  })

  it('D-01 / D-05: recreate-on-demand — after closeDocument, next classifyBatch calls createDocument again', async () => {
    // Step 1: tear down
    await teardownIfIdle()
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1)

    // Step 2: mock getContexts to return [] (document is closed)
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([])
    vi.mocked(chrome.offscreen.createDocument).mockResolvedValue(undefined)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      results: [{ tabId: 1, label: 'Vital', confidence: 0.9 }],
    })

    // Step 3: next classifyBatch should recreate
    await classifyBatch([{ tabId: 1, url: 'https://example.com', meta: makeMeta() }])

    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1)
  })
})
