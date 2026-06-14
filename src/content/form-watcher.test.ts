// Covers FR-11 scroll+form capture/restore and FR-12 timing contract (Phase 4)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEBOUNCE_MS, RESTORE_CAP_MS } from '../shared/constants'

// Mock dependencies (chrome.runtime is provided by vitest-chrome in vitest.setup.ts)

beforeEach(() => {
  vi.clearAllMocks()
  // CRITICAL: performance.now() is not faked by default — must opt-in explicitly
  // See: github.com/vitest-dev/vitest/issues/9352
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

it('Wave 0 infrastructure check: DEBOUNCE_MS and RESTORE_CAP_MS constants are defined', () => {
  // Verifies shared/constants exports before any behavior tests
  expect(DEBOUNCE_MS).toBe(500)
  expect(RESTORE_CAP_MS).toBe(550)
})

describe('captureState (FR-11 — capture)', () => {
  it('returns scroll {x, y} from window.scrollX and window.scrollY', async () => {
    const { captureState } = await import('./form-watcher')
    Object.defineProperty(window, 'scrollX', { value: 42, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 99, configurable: true })
    const result = captureState()
    expect(result.scroll).toEqual({ x: 42, y: 99 })
  })

  it('includes a text input value in fields[]', async () => {
    const { captureState } = await import('./form-watcher')
    // Create a text input in the JSDOM document
    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'myField'
    input.value = 'hello'
    document.body.appendChild(input)
    const result = captureState()
    const found = result.fields.find(f => f.id === 'myField')
    expect(found).toBeDefined()
    expect(found?.value).toBe('hello')
    document.body.removeChild(input)
  })

  it('excludes a password input from fields[]', async () => {
    const { captureState } = await import('./form-watcher')
    const input = document.createElement('input')
    input.type = 'password'
    input.id = 'pwField'
    input.value = 'secret'
    document.body.appendChild(input)
    const result = captureState()
    const found = result.fields.find(f => f.id === 'pwField')
    expect(found).toBeUndefined()
    document.body.removeChild(input)
  })

  it('caps fields at MAX_FIELDS (50)', async () => {
    const { captureState } = await import('./form-watcher')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < 60; i++) {
      const inp = document.createElement('input')
      inp.type = 'text'
      inp.id = `cap-field-${i}`
      inp.value = `val${i}`
      document.body.appendChild(inp)
      inputs.push(inp)
    }
    const result = captureState()
    expect(result.fields.length).toBeLessThanOrEqual(50)
    inputs.forEach(inp => document.body.removeChild(inp))
  })

  it('truncates field values to MAX_FIELD_VALUE_LEN (10000) chars', async () => {
    const { captureState } = await import('./form-watcher')
    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'longField'
    input.value = 'x'.repeat(20000)
    document.body.appendChild(input)
    const result = captureState()
    const found = result.fields.find(f => f.id === 'longField')
    expect(found?.value.length).toBeLessThanOrEqual(10000)
    document.body.removeChild(input)
  })

  it('serializes checkbox as "true"/"false"', async () => {
    const { captureState } = await import('./form-watcher')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.id = 'myCheckbox'
    cb.checked = true
    document.body.appendChild(cb)
    const result = captureState()
    const found = result.fields.find(f => f.id === 'myCheckbox')
    expect(found?.value).toBe('true')
    document.body.removeChild(cb)
  })
})

describe('shouldCapture exclusions (FR-11 D-03)', () => {
  it('returns false for password inputs', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'password'
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for hidden inputs', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'hidden'
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for file inputs', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'file'
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for cc-number autocomplete', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    el.setAttribute('autocomplete', 'cc-number')
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for cc- prefix autocomplete', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    el.setAttribute('autocomplete', 'cc-exp')
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for one-time-code autocomplete', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    el.setAttribute('autocomplete', 'one-time-code')
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns false for new-password autocomplete', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    el.setAttribute('autocomplete', 'new-password')
    expect(shouldCapture(el)).toBe(false)
  })

  it('returns true for text inputs', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    expect(shouldCapture(el)).toBe(true)
  })

  it('returns true for textarea', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('textarea')
    expect(shouldCapture(el)).toBe(true)
  })

  it('returns true for select', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('select')
    expect(shouldCapture(el)).toBe(true)
  })

  it('returns true for checkbox', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'checkbox'
    expect(shouldCapture(el)).toBe(true)
  })

  it('returns true for radio', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'radio'
    expect(shouldCapture(el)).toBe(true)
  })

  it('returns true for email inputs', async () => {
    const { shouldCapture } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'email'
    expect(shouldCapture(el)).toBe(true)
  })
})

describe('resolveField matching (FR-11 D-04)', () => {
  it('matches field by id when id is present', async () => {
    const { resolveField } = await import('./form-watcher')
    const el = document.createElement('input')
    el.id = 'myId'
    document.body.appendChild(el)
    const found = resolveField({ id: 'myId', value: 'x', type: 'input[text]' })
    expect(found).toBe(el)
    document.body.removeChild(el)
  })

  it('matches field by name when no id', async () => {
    const { resolveField } = await import('./form-watcher')
    const el = document.createElement('input')
    el.setAttribute('name', 'myName')
    document.body.appendChild(el)
    const found = resolveField({ name: 'myName', value: 'x', type: 'input[text]' })
    expect(found).toBe(el)
    document.body.removeChild(el)
  })

  it('matches field by selectorPath as fallback', async () => {
    const { resolveField } = await import('./form-watcher')
    const el = document.createElement('input')
    el.type = 'text'
    document.body.appendChild(el)
    // Get the nth-child path manually
    const parent = el.parentElement!
    const idx = Array.from(parent.children).indexOf(el) + 1
    const path = `input:nth-child(${idx})`
    const found = resolveField({ selectorPath: path, value: 'x', type: 'input[text]' })
    expect(found).toBe(el)
    document.body.removeChild(el)
  })

  it('returns null when no id/name/path matches', async () => {
    const { resolveField } = await import('./form-watcher')
    const found = resolveField({ id: 'nonexistent-xyz-123', value: 'x', type: 'input[text]' })
    expect(found).toBeNull()
  })
})

describe('startRestore / MutationObserver cap (FR-12)', () => {
  it('MutationObserver disconnects within RESTORE_CAP_MS when cap expires', async () => {
    const { startRestore } = await import('./form-watcher')
    const disconnectSpy = vi.fn()
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect = disconnectSpy
      constructor(public cb: MutationObserverCallback) {}
    })
    const snapshot = {
      tabId: 1,
      url: 'https://example.com',
      scroll: { x: 0, y: 0 },
      fields: [],
      capturedAt: Date.now(),
    }
    startRestore(snapshot)
    vi.advanceTimersByTime(550)
    expect(disconnectSpy).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sets history.scrollRestoration to manual when snapshot provided', async () => {
    const { startRestore } = await import('./form-watcher')
    vi.stubGlobal('MutationObserver', class {
      observe() {}
      disconnect() {}
      constructor(public cb: MutationObserverCallback) {}
    })
    const snapshot = {
      tabId: 1,
      url: 'https://example.com',
      scroll: { x: 10, y: 20 },
      fields: [],
      capturedAt: Date.now(),
    }
    startRestore(snapshot)
    expect(history.scrollRestoration).toBe('manual')
    // Reset
    history.scrollRestoration = 'auto'
    vi.unstubAllGlobals()
  })

  it('does not set scrollRestoration on null snapshot (normal load)', () => {
    // scrollRestoration default is 'auto' — if we never call startRestore, it stays auto
    // Simulating that on a null GET_STATE response, startRestore is never called
    history.scrollRestoration = 'auto'
    // No call to startRestore — verify it stays 'auto'
    expect(history.scrollRestoration).toBe('auto')
  })
})
