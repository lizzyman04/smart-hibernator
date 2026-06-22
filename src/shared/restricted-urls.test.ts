// Truth-table tests for isInjectable() predicate (D-06)
// Covers: restricted-URL denylist, http/https passthrough, CWS host blocking
import { describe, it, expect } from 'vitest'
import { isInjectable, RESTRICTED_PREFIXES } from './restricted-urls'

describe('isInjectable — falsy/empty inputs', () => {
  it('returns false for undefined', () => {
    expect(isInjectable(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isInjectable('')).toBe(false)
  })
})

describe('isInjectable — browser-restricted protocol prefixes', () => {
  it('returns false for chrome://settings', () => {
    expect(isInjectable('chrome://settings')).toBe(false)
  })

  it('returns false for chrome-extension:// URL', () => {
    expect(isInjectable('chrome-extension://abc123/popup.html')).toBe(false)
  })

  it('returns false for edge://flags', () => {
    expect(isInjectable('edge://flags')).toBe(false)
  })

  it('returns false for about:blank', () => {
    expect(isInjectable('about:blank')).toBe(false)
  })

  it('returns false for devtools:// URL', () => {
    expect(isInjectable('devtools://devtools/bundled/devtools_app.html')).toBe(false)
  })

  it('returns false for view-source: URL', () => {
    expect(isInjectable('view-source:http://example.com')).toBe(false)
  })

  it('returns false for chrome-untrusted:// URL', () => {
    expect(isInjectable('chrome-untrusted://some-app/page')).toBe(false)
  })
})

describe('isInjectable — Chrome Web Store hosts', () => {
  it('returns false for https://chromewebstore.google.com/...', () => {
    expect(isInjectable('https://chromewebstore.google.com/detail/some-extension')).toBe(false)
  })

  it('returns false for https://chrome.google.com/webstore/...', () => {
    expect(isInjectable('https://chrome.google.com/webstore/detail/some-ext')).toBe(false)
  })
})

describe('isInjectable — injectable (http/https) URLs', () => {
  it('returns true for https://github.com', () => {
    expect(isInjectable('https://github.com')).toBe(true)
  })

  it('returns true for http://localhost:3000', () => {
    expect(isInjectable('http://localhost:3000')).toBe(true)
  })

  it('returns true for a generic https page', () => {
    expect(isInjectable('https://example.com/some/path?q=1')).toBe(true)
  })

  it('returns true for http URL', () => {
    expect(isInjectable('http://httpbin.org/get')).toBe(true)
  })
})

describe('RESTRICTED_PREFIXES export', () => {
  it('is an array', () => {
    expect(Array.isArray(RESTRICTED_PREFIXES)).toBe(true)
  })

  it('contains chrome:// prefix', () => {
    expect(RESTRICTED_PREFIXES).toContain('chrome://')
  })

  it('contains chrome-extension:// prefix', () => {
    expect(RESTRICTED_PREFIXES).toContain('chrome-extension://')
  })

  it('contains CWS store hosts', () => {
    expect(RESTRICTED_PREFIXES).toContain('https://chromewebstore.google.com')
    expect(RESTRICTED_PREFIXES).toContain('https://chrome.google.com/webstore')
  })
})
