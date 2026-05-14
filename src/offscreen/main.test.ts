// Wave 0 infrastructure stubs for FR-05 offscreen CLASSIFY_BATCH handler and NFR-04 zero-external-fetch invariant.
// Behavioral tests (it.todo) will be filled by Wave 1 plan 03-02 once offscreen/main.ts is created.
// The offscreen module does not exist yet — only the chrome shims from vitest.setup.ts are tested here.
import { describe, it, expect } from 'vitest'

describe('offscreen/main (FR-05 / NFR-04)', () => {
  it('Wave 0 infrastructure check: chrome.offscreen is shimmed in vitest.setup.ts', () => {
    expect(typeof (chrome as any).offscreen?.createDocument).toBe('function')
  })

  it('Wave 0 infrastructure check: chrome.runtime.getContexts is shimmed', () => {
    expect(typeof chrome.runtime.getContexts).toBe('function')
  })

  it.todo('FR-05: CLASSIFY_BATCH handler returns { results: [...] } shape with label and confidence per tabId')
  it.todo('NFR-04: no fetch() call with external (non chrome-extension://) URL is ever made from offscreen/main.ts')
  it.todo('FR-05: getSession reuses the same InferenceSession across multiple classify calls')
})
