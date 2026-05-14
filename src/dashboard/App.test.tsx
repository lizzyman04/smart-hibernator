// Covers FR-10 dashboard Stats + Settings behavioral contract
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

describe('Dashboard App (FR-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {},
          ai_install_date: Date.now(),
        })
      }
      return Promise.resolve({})
    })
    // chrome.storage.onChanged.addListener/removeListener are real event-emitter functions
    // in vitest-chrome (not vi.fn() spies) — no mockReturnValue needed
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined)
    vi.mocked(chrome.tabs.query).mockResolvedValue([])
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)
  })

  it('Wave 0 infrastructure check: test suite loads without error', () => {
    expect(true).toBe(true)
  })

  it('Stats tab: hero metric shows "~0 MB" when hibernatedCount is 0', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('~0 MB')).toBeInTheDocument()
    })
    expect(screen.getByText('freed this session')).toBeInTheDocument()
  })

  it('Stats tab: hero metric shows "~300 MB" when hibernatedCount is 2', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({ hibernated_count: 2, hibernation_events: [], timeout_minutes: 45, protected_domains: [], ai_classifications: {}, ai_install_date: Date.now() })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('~300 MB')).toBeInTheDocument()
    })
  })

  it('Settings tab: timeout label shows value from storage (60 minutes)', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 60, protected_domains: [], ai_classifications: {}, ai_install_date: Date.now() })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Radix Tabs activates on mouseDown (button=0, ctrlKey=false) — fireEvent.click alone won't switch tabs
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument()
    })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })
    await waitFor(() => {
      expect(screen.getByText('60 minutes')).toBeInTheDocument()
    })
  })

  it('Settings tab: handleAddDomain strips https:// before storing', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    // Radix Tabs activates on mouseDown (button=0, ctrlKey=false)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. github.com')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. github.com'), {
      target: { value: 'https://github.com' },
    })
    fireEvent.click(screen.getByText('Add Domain'))
    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ protected_domains: ['github.com'] })
      )
    })
  })

  it('Settings tab: handleAddDomain rejects empty string — shows error', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    // Radix Tabs activates on mouseDown (button=0, ctrlKey=false)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })
    await waitFor(() => {
      expect(screen.getByText('Add Domain')).toBeInTheDocument()
    })
    // Use 'https://' as input — it is non-empty so button is enabled, but after stripping
    // the protocol prefix the domain becomes '', triggering "Please enter a domain." error
    const input = screen.getByPlaceholderText('e.g. github.com')
    fireEvent.change(input, { target: { value: 'https://' } })
    fireEvent.click(screen.getByText('Add Domain'))
    await waitFor(() => {
      expect(screen.getByText('Please enter a domain.')).toBeInTheDocument()
    })
  })

  it('Settings tab: handleAddDomain rejects duplicate — shows error', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 45, protected_domains: ['github.com'], ai_classifications: {}, ai_install_date: Date.now() })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Radix Tabs activates on mouseDown (button=0, ctrlKey=false)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. github.com')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. github.com'), {
      target: { value: 'github.com' },
    })
    fireEvent.click(screen.getByText('Add Domain'))
    await waitFor(() => {
      expect(screen.getByText('Domain already protected.')).toBeInTheDocument()
    })
  })

  it('Settings tab: remove chip calls chrome.storage.local.set with domain removed', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 45, protected_domains: ['github.com'], ai_classifications: {}, ai_install_date: Date.now() })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Radix Tabs activates on mouseDown (button=0, ctrlKey=false)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Settings' }), { button: 0, ctrlKey: false })
    await waitFor(() => {
      expect(screen.getByLabelText('Remove github.com')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Remove github.com'))
    await waitFor(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ protected_domains: [] })
      )
    })
  })

  // ─── Phase 3: AI Classification section tests (FR-05/D-13, FR-06) ─────────

  it('FR-05/D-13: Stats tab AI Classification section shows V S D counts', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {
            1: { label: 'Vital', confidence: 0.9, cachedAt: 0 },
            2: { label: 'Semi-Active', confidence: 0.7, cachedAt: 0 },
            3: { label: 'Dead', confidence: 0.8, cachedAt: 0 },
            4: { label: 'Vital', confidence: 0.95, cachedAt: 0 },
          },
          ai_install_date: Date.now(),
        })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('AI Classification')).toBeInTheDocument()
    })
    // Labels are present
    expect(screen.getByText('Vital')).toBeInTheDocument()
    expect(screen.getByText('Semi-Active')).toBeInTheDocument()
    expect(screen.getByText('Dead')).toBeInTheDocument()
    // Counts: 2 Vital, 1 Semi-Active, 1 Dead
    // Use getAllByText to handle any collisions with existing content
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(1)
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(2) // 1 Semi-Active, 1 Dead
  })

  it('FR-06/D-13: shows "AI tuning: N days remaining" when ai_install_date is recent', async () => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 3600 * 1000
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {},
          ai_install_date: fiveDaysAgo,
        })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('AI tuning: 9 days remaining')).toBeInTheDocument()
    })
  })

  it('FR-06/D-13: shows "AI tuned" when daysSinceInstall >= AI_LEARNING_DAYS', async () => {
    const fifteenDaysAgo = Date.now() - 15 * 24 * 3600 * 1000
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {},
          ai_install_date: fifteenDaysAgo,
        })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('AI tuned')).toBeInTheDocument()
    })
  })

  it('FR-06/D-13: AI summary handles empty ai_classifications (cold start)', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {},
          ai_install_date: Date.now(),
        })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('AI Classification')).toBeInTheDocument()
    })
    // All counts should be zero — tabular-nums spans within the AI section
    // Use getAllByText('0') since the hibernated count also shows 0
    const zeros = screen.getAllByText('0')
    // At least 3 zeros for V/S/D counts
    expect(zeros.length).toBeGreaterThanOrEqual(3)
  })

  it('FR-05: AI summary ignores classification entries with label === null (cold start per tab)', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({
          hibernated_count: 0,
          hibernation_events: [],
          timeout_minutes: 45,
          protected_domains: [],
          ai_classifications: {
            1: { label: null, confidence: 0, cachedAt: 0 },
          },
          ai_install_date: Date.now(),
        })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('AI Classification')).toBeInTheDocument()
    })
    // Counts should all still be 0 (null label is ignored)
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(3)
  })
})
