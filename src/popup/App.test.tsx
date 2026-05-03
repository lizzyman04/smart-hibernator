// Covers FR-09 popup hibernated-tab manager behavioral contract
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock idb module — popup imports getThumbnail + deleteThumbnail from background/idb
vi.mock('../background/idb', () => ({
  getThumbnail: vi.fn().mockResolvedValue(undefined),
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
}))

const mockDiscardedTab: chrome.tabs.Tab = {
  id: 42,
  index: 0,
  pinned: false,
  highlighted: false,
  windowId: 1,
  active: false,
  incognito: false,
  selected: false,
  discarded: true,
  autoDiscardable: true,
  groupId: -1,
  url: 'https://example.com/page',
  title: 'Example Domain',
  favIconUrl: undefined,
  status: 'complete',
  audible: false,
}

describe('Popup App (FR-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: storage has hibernation_enabled=true, hibernated_count=0, protected_tabs=[]
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernation_enabled: true,
          hibernated_count: 0,
          protected_tabs: [],
        })
      }
      return Promise.resolve({})
    })
    // Default: no discarded tabs
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    // chrome.storage.onChanged.addListener/removeListener are real event-emitter functions
    // in vitest-chrome — not vi.fn() spies, so no mockReturnValue needed
    vi.mocked(chrome.tabs.update).mockResolvedValue({} as chrome.tabs.Tab)
    vi.mocked(chrome.runtime.getURL).mockReturnValue('chrome-extension://abc/src/dashboard/index.html')
    vi.mocked(chrome.tabs.create).mockResolvedValue({} as chrome.tabs.Tab)
  })

  it('renders without crashing', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    expect(document.body).toBeTruthy()
  })

  it('renders empty state "No hibernated tabs" when chrome.tabs.query returns []', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('No hibernated tabs')).toBeInTheDocument()
    })
  })

  it('renders a Wake Tab button for each discarded tab', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Wake Tab')).toBeInTheDocument()
    })
    expect(screen.getByText('Example Domain')).toBeInTheDocument()
    // domain appears in both fallback card and row body — getAllByText confirms presence
    expect(screen.getAllByText('example.com').length).toBeGreaterThan(0)
  })

  it('Wake Tab button calls chrome.tabs.update(tabId, {active:true})', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Wake Tab')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Wake Tab'))
    await waitFor(() => {
      expect(chrome.tabs.update).toHaveBeenCalledWith(42, { active: true })
    })
  })

  it('Dashboard footer link calls chrome.tabs.create with chrome.runtime.getURL result', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Dashboard'))
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/src/dashboard/index.html',
    })
  })
})
