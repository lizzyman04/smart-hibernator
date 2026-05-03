// Wave 0 stub — covers FR-10 dashboard Stats + Settings contract
// Real implementation (App.tsx) created in Plan 02-04 (Wave 3)
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Dashboard App (FR-10) — Wave 0 stubs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') cb({})
      return Promise.resolve({})
    })
    // chrome.storage.onChanged.addListener is a real event-emitter function in vitest-chrome
    // (not a vi.fn() spy) — no mockReturnValue needed; listeners won't be invoked in stubs
  })

  it('Wave 0 infrastructure check: test suite loads without error', () => {
    expect(true).toBe(true)
  })

  it.todo('Stats tab: hero metric displays "~N MB" computed from hibernated_count * 150')
  it.todo('Stats tab: hero metric uses tilde prefix at all times (signals estimation)')
  it.todo('Settings tab: timeout slider writes timeout_minutes to chrome.storage.local on onValueCommit')
  it.todo('Settings tab: handleAddDomain strips https:// prefix before storing')
  it.todo('Settings tab: handleAddDomain rejects empty string — domainError set')
  it.todo('Settings tab: handleAddDomain rejects duplicate domain — domainError set')
  it.todo('Settings tab: remove chip calls chrome.storage.local.set with domain removed from array')
})
