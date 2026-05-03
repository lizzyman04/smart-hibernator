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
        cb({ hibernated_count: 2, hibernation_events: [], timeout_minutes: 45, protected_domains: [] })
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
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 60, protected_domains: [] })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    // Click Settings tab to see Settings content
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Settings'))
    await waitFor(() => {
      expect(screen.getByText('60 minutes')).toBeInTheDocument()
    })
  })

  it('Settings tab: handleAddDomain strips https:// before storing', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(screen.getByText('Settings'))
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
    fireEvent.click(screen.getByText('Settings'))
    await waitFor(() => {
      expect(screen.getByText('Add Domain')).toBeInTheDocument()
    })
    // Attempt to add empty — need to click with empty input
    // Note: The Add Domain button is disabled when domainInput is empty (trimmed).
    // To test the error path, we set a value then clear it and try to add
    const input = screen.getByPlaceholderText('e.g. github.com')
    fireEvent.change(input, { target: { value: '   ' } })
    // The button may be disabled for whitespace-only input — click anyway to trigger handler
    const addBtn = screen.getByText('Add Domain')
    // Temporarily remove disabled to force click
    addBtn.removeAttribute('disabled')
    fireEvent.click(addBtn)
    await waitFor(() => {
      expect(screen.getByText('Please enter a domain.')).toBeInTheDocument()
    })
  })

  it('Settings tab: handleAddDomain rejects duplicate — shows error', async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation((_keys, cb) => {
      if (typeof cb === 'function') {
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 45, protected_domains: ['github.com'] })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(screen.getByText('Settings'))
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
        cb({ hibernated_count: 0, hibernation_events: [], timeout_minutes: 45, protected_domains: ['github.com'] })
      }
      return Promise.resolve({})
    })
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(screen.getByText('Settings'))
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
})
