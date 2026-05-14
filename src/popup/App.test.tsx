// Covers FR-09 popup hibernated-tab manager behavioral contract
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { chrome } from 'vitest-chrome/lib/index.esm.js'

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

const mockDiscardedTab2: chrome.tabs.Tab = {
  ...mockDiscardedTab,
  id: 43,
  url: 'https://another.com/page',
  title: 'Another Domain',
}

// Helper: builds a storage mock that returns the right keys regardless of whether
// called with a string key or an array of keys. The App calls storage.local.get
// with an array on mount and with the string 'ai_classifications' in loadHibernatedTabs.
function makeStorageMock(values: Record<string, unknown>) {
  return (_keys: unknown, cb: (result: Record<string, unknown>) => void) => {
    if (typeof cb === 'function') {
      cb(values)
    }
    return Promise.resolve({})
  }
}

describe('Popup App (FR-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: storage has hibernation_enabled=true, hibernated_count=0, protected_tabs=[], ai_classifications={}
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: {},
      })
    )
    // Default: no discarded tabs
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    // chrome.storage.onChanged.addListener/removeListener are real event-emitter functions
    // in vitest-chrome — not vi.fn() spies, so no mockReturnValue needed
    vi.mocked(chrome.tabs.update).mockResolvedValue({} as chrome.tabs.Tab)
    vi.mocked(chrome.runtime.getURL).mockReturnValue('chrome-extension://abc/src/dashboard/index.html')
    vi.mocked(chrome.tabs.create).mockResolvedValue({} as chrome.tabs.Tab)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)
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

  // ─── Phase 3: V/S/D pill badge tests (FR-05 / D-12) ──────────────────────

  it('FR-05/D-12: renders Vital pill (V) for tab with Vital classification', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: { 42: { label: 'Vital', confidence: 0.9, cachedAt: 0 } },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('V')).toBeInTheDocument()
    })
  })

  it('FR-05/D-12: renders Semi-Active pill (S) for tab with Semi-Active classification', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: { 42: { label: 'Semi-Active', confidence: 0.75, cachedAt: 0 } },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('S')).toBeInTheDocument()
    })
  })

  it('FR-05/D-12: renders Dead pill (D) for tab with Dead classification', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: { 42: { label: 'Dead', confidence: 0.85, cachedAt: 0 } },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('D')).toBeInTheDocument()
    })
  })

  it('FR-05/D-12: renders no pill when classification.label is null', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: { 42: { label: null, confidence: 0, cachedAt: 0 } },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Wait for tab row to render (Wake Tab button confirms row is present)
    await waitFor(() => {
      expect(screen.getByText('Wake Tab')).toBeInTheDocument()
    })
    expect(screen.queryByText('V')).toBeNull()
    expect(screen.queryByText('S')).toBeNull()
    expect(screen.queryByText('D')).toBeNull()
  })

  it('FR-05/D-12: renders no pill when classification is undefined (cold start)', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: {},
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Wait for tab row to render
    await waitFor(() => {
      expect(screen.getByText('Wake Tab')).toBeInTheDocument()
    })
    expect(screen.queryByText('V')).toBeNull()
    expect(screen.queryByText('S')).toBeNull()
    expect(screen.queryByText('D')).toBeNull()
  })

  it('FR-06/D-14: Keep button click sends KEEP_ALIVE message with tabId and domain', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByLabelText('Keep alive example.com')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Keep alive example.com'))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'KEEP_ALIVE',
        tabId: 42,
        domain: 'example.com',
      })
    })
  })

  it('D-12: Vital pill renders with the correct ARIA title', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: { 42: { label: 'Vital', confidence: 0.9, cachedAt: 0 } },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('V')).toBeInTheDocument()
    })
    const pillEl = screen.getByText('V')
    expect(pillEl.closest('[title]')?.getAttribute('title')).toBe('Vital')
  })

  it('FR-05: pill updates live when storage onChanged fires with new ai_classifications', async () => {
    // Start with no classifications (no pill)
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)

    // Wait for tab row to render
    await waitFor(() => {
      expect(screen.getByText('Wake Tab')).toBeInTheDocument()
    })

    // No pill yet
    expect(screen.queryByText('V')).toBeNull()

    // Simulate storage.onChanged firing with a Vital classification
    chrome.storage.onChanged.callListeners(
      {
        ai_classifications: {
          newValue: { 42: { label: 'Vital', confidence: 0.9, cachedAt: Date.now() } },
          oldValue: {},
        },
      },
      'local'
    )

    // Pill should now appear
    await waitFor(() => {
      expect(screen.getByText('V')).toBeInTheDocument()
    })
  })

  it('FR-05/D-12: multiple tabs render correct pills when multiple classifications present', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      makeStorageMock({
        hibernation_enabled: true,
        hibernated_count: 0,
        protected_tabs: [],
        ai_classifications: {
          42: { label: 'Vital', confidence: 0.9, cachedAt: 0 },
          43: { label: 'Dead', confidence: 0.8, cachedAt: 0 },
        },
      })
    )
    vi.mocked(chrome.tabs.query).mockImplementation(async (queryInfo) => {
      if (queryInfo && (queryInfo as chrome.tabs.QueryInfo).discarded === true) {
        return [mockDiscardedTab, mockDiscardedTab2]
      }
      return [{ ...mockDiscardedTab, active: true, discarded: false, id: 99 }]
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('V')).toBeInTheDocument()
      expect(screen.getByText('D')).toBeInTheDocument()
    })
  })
})
