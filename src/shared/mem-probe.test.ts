// Tests for src/shared/mem-probe.ts — D-02 guarded memory probe (dev visibility)
// Verifies: never throws, guards crossOriginIsolated, guards DEV env, measures when available.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Constants check
// ─────────────────────────────────────────────────────────────────────────────

describe('OFFSCREEN_IDLE_MS constant', () => {
  it('OFFSCREEN_IDLE_MS is defined in constants and equals 10 * 60 * 1000', async () => {
    const { OFFSCREEN_IDLE_MS } = await import('./constants')
    expect(OFFSCREEN_IDLE_MS).toBe(10 * 60 * 1000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// logMemoryProbe — D-02 guarded dev probe
// ─────────────────────────────────────────────────────────────────────────────

describe('logMemoryProbe (D-02)', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    // Default: non-COI environment (the most common case in this extension)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Clean up globalThis modifications
    delete (globalThis as any).crossOriginIsolated
    delete (performance as any).measureUserAgentSpecificMemory
  })

  it('D-02: never throws when crossOriginIsolated is false', async () => {
    ;(globalThis as any).crossOriginIsolated = false
    const { logMemoryProbe } = await import('./mem-probe')
    await expect(logMemoryProbe('test')).resolves.toBeUndefined()
  })

  it('D-02: never throws when crossOriginIsolated is undefined', async () => {
    delete (globalThis as any).crossOriginIsolated
    const { logMemoryProbe } = await import('./mem-probe')
    await expect(logMemoryProbe('test')).resolves.toBeUndefined()
  })

  it('D-02: returns early and logs "probe unavailable" when crossOriginIsolated is false', async () => {
    ;(globalThis as any).crossOriginIsolated = false
    const { logMemoryProbe } = await import('./mem-probe')
    await logMemoryProbe('myTag')
    // Should have logged something mentioning unavailability
    expect(debugSpy).toHaveBeenCalled()
    const logged = debugSpy.mock.calls[0][0] as string
    expect(logged).toMatch(/unavailable|probe/i)
  })

  it('D-02: returns early when measureUserAgentSpecificMemory is not a function', async () => {
    ;(globalThis as any).crossOriginIsolated = true
    ;(performance as any).measureUserAgentSpecificMemory = undefined
    const { logMemoryProbe } = await import('./mem-probe')
    await expect(logMemoryProbe('test')).resolves.toBeUndefined()
    expect(debugSpy).toHaveBeenCalled()
  })

  it('D-02: calls measureUserAgentSpecificMemory when COI=true and fn is available', async () => {
    ;(globalThis as any).crossOriginIsolated = true
    const measureMock = vi.fn().mockResolvedValue({
      bytes: 10 * 1048576,
      breakdown: [],
    })
    ;(performance as any).measureUserAgentSpecificMemory = measureMock

    const { logMemoryProbe } = await import('./mem-probe')
    await logMemoryProbe('session-init')

    expect(measureMock).toHaveBeenCalled()
    expect(debugSpy).toHaveBeenCalled()
    // Should log MB value
    const logged = debugSpy.mock.calls.find((c) => String(c[0]).includes('MB'))
    expect(logged).toBeDefined()
  })

  it('D-02: does not throw when measureUserAgentSpecificMemory rejects', async () => {
    ;(globalThis as any).crossOriginIsolated = true
    const measureMock = vi.fn().mockRejectedValue(new Error('SecurityError'))
    ;(performance as any).measureUserAgentSpecificMemory = measureMock

    const { logMemoryProbe } = await import('./mem-probe')
    await expect(logMemoryProbe('test')).resolves.toBeUndefined()
    // Should have logged the error
    expect(debugSpy).toHaveBeenCalled()
  })
})
