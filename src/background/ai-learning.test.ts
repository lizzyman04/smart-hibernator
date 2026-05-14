// Behavioral tests for ai-learning.ts — FR-06 (learning mode: bias write + visit tracking)
// Analog pattern: src/background/idb.test.ts "Wave 0 infrastructure check" idiom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_BIAS_MAX, AI_WAKE_SIGNAL_WINDOW_MS } from '../shared/constants'

// ─── Shared mock references (vi.hoisted pattern from Wave 1 — avoids hoisting errors) ───
const { getDomainBiasMock, putDomainBiasMock, appendTabHistoryMock } = vi.hoisted(() => ({
  getDomainBiasMock: vi.fn(),
  putDomainBiasMock: vi.fn(),
  appendTabHistoryMock: vi.fn(),
}))

vi.mock('./idb', () => ({
  getDomainBias: getDomainBiasMock,
  putDomainBias: putDomainBiasMock,
  appendTabHistory: appendTabHistoryMock,
}))

import {
  recordKeepAlive,
  recordTabActivation,
  closeTabVisit,
  recordWakeMisclassification,
  __resetOpenVisitMaps,
} from './ai-learning'

describe('ai-learning (FR-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetOpenVisitMaps()
    putDomainBiasMock.mockResolvedValue(undefined)
    appendTabHistoryMock.mockResolvedValue(undefined)
  })

  // ─── Wave 0 infrastructure check ─────────────────────────────────────────

  it('Wave 0 infrastructure check: AI_BIAS_MAX is 1.0 and AI_WAKE_SIGNAL_WINDOW_MS is 5 minutes', () => {
    expect(AI_BIAS_MAX).toBe(1.0)
    expect(AI_WAKE_SIGNAL_WINDOW_MS).toBe(5 * 60 * 1000)
  })

  // ─── recordKeepAlive ─────────────────────────────────────────────────────

  it('FR-06: recordKeepAlive increments biasOffset by 0.2 on a fresh domain', async () => {
    getDomainBiasMock.mockResolvedValue(undefined) // no existing record
    await recordKeepAlive(1, 'github.com')
    expect(putDomainBiasMock).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'github.com', biasOffset: 0.2, keepAliveCount: 1 })
    )
  })

  it('FR-06: recordKeepAlive clamps biasOffset to AI_BIAS_MAX', async () => {
    getDomainBiasMock.mockResolvedValue({
      domain: 'github.com',
      biasOffset: 0.95,
      keepAliveCount: 4,
      misclassificationCount: 0,
      updatedAt: Date.now() - 1000,
    })
    await recordKeepAlive(1, 'github.com')
    expect(putDomainBiasMock).toHaveBeenCalledWith(
      expect.objectContaining({ biasOffset: 1.0 }) // 0.95 + 0.2 = 1.15 → clamped to 1.0
    )
  })

  it('FR-06: recordKeepAlive increments keepAliveCount and writes updatedAt', async () => {
    getDomainBiasMock.mockResolvedValue({
      domain: 'example.com',
      biasOffset: 0.3,
      keepAliveCount: 3,
      misclassificationCount: 0,
      updatedAt: Date.now() - 5000,
    })
    await recordKeepAlive(2, 'example.com')
    expect(putDomainBiasMock).toHaveBeenCalledWith(
      expect.objectContaining({ keepAliveCount: 4, biasOffset: 0.5 })
    )
    const written = putDomainBiasMock.mock.calls[0][0]
    expect(written.updatedAt).toBeGreaterThan(0)
  })

  // ─── recordTabActivation + closeTabVisit ─────────────────────────────────

  it('FR-06: recordTabActivation opens a visit; closeTabVisit appends TabHistoryRecord with correct dwellMs', async () => {
    const fakeNow = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(fakeNow + 4000) // close time = visitStart + 4000ms

    recordTabActivation(1, fakeNow, 'https://github.com/repo')
    await closeTabVisit(1, false)

    expect(appendTabHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'github.com',
        dwellMs: 4000,
        visitStart: fakeNow,
        hadFormActivity: false,
      })
    )
    vi.restoreAllMocks()
  })

  it('FR-06: closeTabVisit no-ops when no visit was opened', async () => {
    await closeTabVisit(999, false) // unknown tabId
    expect(appendTabHistoryMock).not.toHaveBeenCalled()
  })

  it('FR-06: closeTabVisit silently skips invalid URLs', async () => {
    recordTabActivation(7, Date.now(), 'not-a-url')
    await closeTabVisit(7, false)
    expect(appendTabHistoryMock).not.toHaveBeenCalled()
  })

  it('FR-06: closeTabVisit cleans up both openVisits and openUrls entries', async () => {
    const ts = Date.now()
    recordTabActivation(42, ts, 'https://notion.so/page')
    await closeTabVisit(42, true)
    // Second close on same tabId should be a no-op (maps already cleaned)
    await closeTabVisit(42, true)
    expect(appendTabHistoryMock).toHaveBeenCalledTimes(1)
  })

  // ─── recordWakeMisclassification ─────────────────────────────────────────

  it('T-03-14: recordWakeMisclassification short-circuits when prior updatedAt is older than AI_WAKE_SIGNAL_WINDOW_MS', async () => {
    getDomainBiasMock.mockResolvedValue({
      domain: 'old.com',
      biasOffset: 0.1,
      keepAliveCount: 0,
      misclassificationCount: 0,
      updatedAt: Date.now() - (AI_WAKE_SIGNAL_WINDOW_MS + 1000), // outside window
    })
    await recordWakeMisclassification('old.com')
    expect(putDomainBiasMock).not.toHaveBeenCalled()
  })

  it('FR-06: recordWakeMisclassification within window applies +0.1 bias', async () => {
    getDomainBiasMock.mockResolvedValue({
      domain: 'recent.com',
      biasOffset: 0.1,
      keepAliveCount: 0,
      misclassificationCount: 2,
      updatedAt: Date.now() - 1000, // well within window
    })
    await recordWakeMisclassification('recent.com')
    expect(putDomainBiasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        biasOffset: expect.closeTo(0.2, 5),
        misclassificationCount: 3,
      })
    )
  })

  it('FR-06: recordWakeMisclassification on cold-start (no existing record) writes initial bias', async () => {
    getDomainBiasMock.mockResolvedValue(undefined) // no prior bias
    await recordWakeMisclassification('newdomain.com')
    expect(putDomainBiasMock).toHaveBeenCalledWith(
      expect.objectContaining({ biasOffset: 0.1, misclassificationCount: 1 })
    )
  })
})
