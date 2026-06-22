// Tests for src/offscreen/main.ts — FR-05 / NFR-03 / NFR-04 / D-01 behavioral assertions.
//
// Testing strategy notes:
// - vi.hoisted() declares createMock/runMock/releaseMock BEFORE the top-level vi.mock()
//   factory runs, making them available in both the factory and test bodies.
// - Listeners registered via chrome.runtime.onMessage.addListener are invoked via
//   vitest-chrome's callListeners() helper (vitest-chrome is a real event emitter,
//   not a vi.fn() spy — addListener does not have a .mock property).
// - NFR-03 tests use vi.doMock() (non-hoisted) + vi.resetModules() + dynamic import()
//   to get a fresh module instance with a fresh session singleton per test.
// - NFR-04 uses vi.spyOn(global, 'fetch') to assert all URLs start with chrome-extension://.
// - navigator.gpu is set via Object.defineProperty (not defined in jsdom by default).
// - D-01 RELEASE_SESSION tests are LAST because they call vi.restoreAllMocks() which
//   can affect the accumulated listener state; they must not precede NFR-03 tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted() executes BEFORE vi.mock() factories — the only way to share mocks
// between the factory and test code when using the top-level mock pattern.
const { runMock, releaseMock, createMock } = vi.hoisted(() => {
  const runMock = vi.fn().mockResolvedValue({
    output_probability: {
      data: new Float32Array([0.1, 0.2, 0.7]),
      dims: [1, 3],
    },
  })
  // releaseMock shared so RELEASE_SESSION tests can assert it was called on the shared session
  const releaseMock = vi.fn().mockResolvedValue(undefined)
  const createMock = vi.fn().mockImplementation(async () => ({ run: runMock, release: releaseMock }))
  return { runMock, releaseMock, createMock }
})

// Top-level mock — hoisted before all imports by vitest
vi.mock('onnxruntime-web/wasm', () => ({
  default: {},
  env: {
    wasm: {
      wasmPaths: '',
      numThreads: 0,
    },
  },
  Tensor: class MockTensor {
    data: Float32Array
    dims: number[]
    constructor(_type: string, data: Float32Array, dims: number[]) {
      this.data = data
      this.dims = dims
    }
  },
  InferenceSession: {
    create: createMock,
  },
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Trigger the onMessage listener as if the Service Worker sent a message.
 * vitest-chrome exposes callListeners() on event objects.
 */
async function dispatchMessage(
  message: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve) => {
    // callListeners invokes all registered listeners with (message, sender, sendResponse)
    // The CLASSIFY_BATCH listener returns `true` to keep the channel open,
    // then calls sendResponse asynchronously.
    ;(chrome.runtime.onMessage as any).callListeners(message, {}, (response: unknown) => {
      resolve(response)
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Wave 0 infrastructure checks (preserved)
// ─────────────────────────────────────────────────────────────────────────────

describe('offscreen/main (FR-05 / NFR-04)', () => {
  it('Wave 0 infrastructure check: chrome.offscreen is shimmed in vitest.setup.ts', () => {
    expect(typeof (chrome as any).offscreen?.createDocument).toBe('function')
  })

  it('Wave 0 infrastructure check: chrome.runtime.getContexts is shimmed', () => {
    expect(typeof chrome.runtime.getContexts).toBe('function')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral tests — shared module (no resetModules)
// ─────────────────────────────────────────────────────────────────────────────

describe('offscreen/main behavioral tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Restore default mock behaviour (Vital result)
    runMock.mockResolvedValue({
      output_probability: {
        data: new Float32Array([0.1, 0.2, 0.7]),
        dims: [1, 3],
      },
    })
    createMock.mockImplementation(async () => ({ run: runMock, release: releaseMock }))

    // Stub fetch so session init succeeds with an empty ArrayBuffer
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response
    )
    // Import registers the onMessage listener (module cached after first call)
    await import('./main')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('FR-05: CLASSIFY_BATCH handler returns { results: [...] } shape with label and confidence per tabId', async () => {
    const response = (await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }],
    })) as { results: Array<{ tabId: number; label: string | null; confidence: number }> }

    expect(Array.isArray(response.results)).toBe(true)
    expect(response.results[0].tabId).toBe(1)
    expect(response.results[0].label).toBe('Vital')
    expect(response.results[0].confidence).toBeCloseTo(0.7, 1)
  })

  it('FR-05: handler returns label: null when features length !== 6', async () => {
    const response = (await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 2, features: [0, 0, 0] }],
    })) as { results: Array<{ tabId: number; label: string | null; confidence: number }> }

    expect(response.results[0].label).toBeNull()
    expect(response.results[0].confidence).toBe(0)
  })

  it('FR-05: getSession reuses the same InferenceSession across multiple classify calls', async () => {
    // Record how many times create has been called before this test
    // (the session may already be warm from a prior test in this describe block)
    const callsBefore = createMock.mock.calls.length

    await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 10, features: [0, 0, 0, 0, 0, 0] }],
    })
    const callsAfterFirst = createMock.mock.calls.length

    await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 11, features: [0, 0, 0, 0, 0, 0] }],
    })
    const callsAfterSecond = createMock.mock.calls.length

    // InferenceSession.create must NOT be called more than once across both dispatches.
    // If the session was already warm (callsBefore > 0 after clearAllMocks reset — impossible
    // since clearAllMocks runs in beforeEach — but just in case: at most 1 new call total).
    expect(callsAfterFirst - callsBefore).toBeLessThanOrEqual(1)
    // Second dispatch must not trigger another create call
    expect(callsAfterSecond).toBe(callsAfterFirst)
  })

  it('CLASSIFY_BATCH ignores unknown message types', async () => {
    // callListeners with a different type; listener returns undefined (falsy)
    // and does NOT call sendResponse
    const callListeners = (chrome.runtime.onMessage as any).callListeners as (
      msg: unknown,
      sender: unknown,
      sendResponse: (r: unknown) => void
    ) => boolean | undefined

    const sendResponse = vi.fn()
    callListeners({ type: 'OTHER_TYPE', data: 'payload' }, {}, sendResponse)

    await new Promise((r) => setTimeout(r, 50))
    expect(sendResponse).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NFR-04: Zero external fetch
// ─────────────────────────────────────────────────────────────────────────────

describe('NFR-04: no fetch() call escapes to a non chrome-extension:// origin', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('all fetch() calls from offscreen/main.ts use chrome-extension:// URLs', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const _url = typeof input === 'string' ? input : (input as Request).url
      return new Response(new ArrayBuffer(8), { status: 200 }) as Response
    })

    // Module already cached — trigger a classify to ensure session was initialised
    await import('./main')
    await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }],
    })

    // All fetch calls (if any occurred in this test's spy window) must be chrome-extension://
    for (const [input] of fetchSpy.mock.calls) {
      const url = typeof input === 'string' ? input : (input as Request).url
      expect(url).toMatch(/^chrome-extension:\/\//)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NFR-03: WebGPU / WASM backend selection
// Uses vi.doMock() + vi.resetModules() + dynamic import() for fresh module graph.
// ─────────────────────────────────────────────────────────────────────────────

describe('NFR-03: executionProviders selection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    Object.defineProperty(global.navigator, 'gpu', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  })

  it('executionProviders contains "webgpu" when navigator.gpu is defined', async () => {
    Object.defineProperty(global.navigator, 'gpu', {
      value: { requestAdapter: vi.fn() },
      configurable: true,
      writable: true,
    })

    vi.resetModules()

    const localCreate = vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        output_probability: { data: new Float32Array([0.1, 0.2, 0.7]), dims: [1, 3] },
      }),
    })

    vi.doMock('onnxruntime-web/wasm', () => ({
      default: {},
      env: { wasm: { wasmPaths: '', numThreads: 0 } },
      Tensor: class MockTensor {
        data: Float32Array
        dims: number[]
        constructor(_type: string, data: Float32Array, dims: number[]) {
          this.data = data; this.dims = dims
        }
      },
      InferenceSession: { create: localCreate },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response
    )

    await import('./main')

    // Trigger session init via message dispatch
    await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }],
    })

    expect(localCreate.mock.calls.length).toBeGreaterThan(0)
    const opts = localCreate.mock.calls[0][1] as { executionProviders: string[] }
    expect(opts.executionProviders).toContain('webgpu')
  })

  it('executionProviders is ["wasm"] only when navigator.gpu is undefined', async () => {
    Object.defineProperty(global.navigator, 'gpu', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    vi.resetModules()

    const localCreate = vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        output_probability: { data: new Float32Array([0.1, 0.2, 0.7]), dims: [1, 3] },
      }),
    })

    vi.doMock('onnxruntime-web/wasm', () => ({
      default: {},
      env: { wasm: { wasmPaths: '', numThreads: 0 } },
      Tensor: class MockTensor {
        data: Float32Array
        dims: number[]
        constructor(_type: string, data: Float32Array, dims: number[]) {
          this.data = data; this.dims = dims
        }
      },
      InferenceSession: { create: localCreate },
    }))

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response
    )

    await import('./main')

    await dispatchMessage({
      type: 'CLASSIFY_BATCH',
      tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }],
    })

    expect(localCreate.mock.calls.length).toBeGreaterThan(0)
    const opts = localCreate.mock.calls[0][1] as { executionProviders: string[] }
    expect(opts.executionProviders).toEqual(['wasm'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D-01: RELEASE_SESSION handler
// Placed LAST to avoid listener accumulation interfering with NFR-03 tests.
// Uses the same shared module (imported in the behavioral tests beforeEach).
// The shared createMock returns a session with release: releaseMock so these
// tests can assert session.release() was called on the module-level singleton.
// ─────────────────────────────────────────────────────────────────────────────

describe('D-01: RELEASE_SESSION handler', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    releaseMock.mockResolvedValue(undefined)
    runMock.mockResolvedValue({
      output_probability: {
        data: new Float32Array([0.1, 0.2, 0.7]),
        dims: [1, 3],
      },
    })
    createMock.mockImplementation(async () => ({ run: runMock, release: releaseMock }))
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(new ArrayBuffer(8), { status: 200 }) as Response
    )
    await import('./main')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function dispatch(message: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve) => {
      ;(chrome.runtime.onMessage as any).callListeners(message, {}, (response: unknown) => {
        resolve(response)
      })
    })
  }

  it('D-01: RELEASE_SESSION responds { ok: true } after session is warmed up', async () => {
    // Warm up the session first
    await dispatch({ type: 'CLASSIFY_BATCH', tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }] })
    const response = await dispatch({ type: 'RELEASE_SESSION' })
    expect(response).toEqual({ ok: true })
  })

  it('D-01: RELEASE_SESSION calls session.release() when session is non-null', async () => {
    // Warm up so session is non-null
    await dispatch({ type: 'CLASSIFY_BATCH', tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }] })
    releaseMock.mockClear() // clear any prior calls from warm-up
    await dispatch({ type: 'RELEASE_SESSION' })
    expect(releaseMock).toHaveBeenCalledTimes(1)
  })

  it('D-01: RELEASE_SESSION is idempotent — responds { ok: true } even when session is null', async () => {
    // Do NOT warm up — module session may or may not be null due to prior tests.
    // Call twice to assert idempotency regardless of initial session state.
    await dispatch({ type: 'RELEASE_SESSION' })
    const response2 = await dispatch({ type: 'RELEASE_SESSION' })
    expect(response2).toEqual({ ok: true })
  })

  it('D-01: RELEASE_SESSION still responds { ok: true } even when session.release() rejects', async () => {
    releaseMock.mockRejectedValue(new Error('ORT dispose error'))
    // Warm up the session
    await dispatch({ type: 'CLASSIFY_BATCH', tabs: [{ tabId: 1, features: [0, 0, 0, 0, 0, 0] }] })
    const response = await dispatch({ type: 'RELEASE_SESSION' })
    expect(response).toEqual({ ok: true })
  })

  it('D-01: only one onMessage.addListener call exists in main.ts (top-level listener invariant)', async () => {
    // Use process.cwd() + known relative path — import.meta.url is unreliable in worktree
    const fs = await import('fs')
    const path = await import('path')
    const sourcePath = path.resolve(process.cwd(), 'src/offscreen/main.ts')
    const source = fs.readFileSync(sourcePath, 'utf8')
    const addListenerCount = (source.match(/onMessage\.addListener/g) ?? []).length
    expect(addListenerCount).toBe(1)
  })
})
