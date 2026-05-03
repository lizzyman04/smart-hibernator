// Wave 0 stub — covers FR-09 popup hibernated-tab manager contract
// Real implementation (App.tsx redesign) created in Plan 02-03 (Wave 2)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Stub chrome.tabs.query for popup (needed after Wave 2 redesign)
// This Wave 0 test renders the CURRENT Phase 1 App — it just checks the infrastructure works

describe('Popup App (FR-09) — Wave 0 stubs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') cb({ hibernation_enabled: true, hibernated_count: 0, protected_tabs: [] })
      return Promise.resolve({})
    })
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    // chrome.storage.onChanged.addListener is a real event-emitter function in vitest-chrome
    // (not a vi.fn() spy) — no mockReturnValue needed; listeners won't be invoked in stubs
  })

  it('Wave 0: renders without crashing', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    expect(document.body).toBeTruthy()
  })

  it.todo('renders empty state "No hibernated tabs" when chrome.tabs.query returns []')
  it.todo('renders a list row for each discarded tab returned by chrome.tabs.query')
  it.todo('Wake Tab button calls chrome.tabs.update(tabId, { active: true })')
  it.todo('thumbnail cell shows fallback card when no IndexedDB record exists for the tabId')
  it.todo('Dashboard footer button calls chrome.tabs.create with chrome.runtime.getURL result')
})
