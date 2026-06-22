// Shared predicate for URL injection eligibility (D-06).
// Mirrors the http-guard convention in hibernation.ts isDiscardable (line 17).
// Used by the SW side (importable); content script INLINES this list (no-import convention).

export const RESTRICTED_PREFIXES: string[] = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
  'chrome-untrusted://',
  'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
]

/**
 * Returns true only for URLs that are safe to inject a content script into.
 * - Returns false for falsy/empty URLs
 * - Returns false for non-http/https protocols
 * - Returns false for any URL matching a RESTRICTED_PREFIXES entry
 * - Returns true for plain http:// and https:// URLs not in the denylist
 *
 * Mirrors the startsWith('http://') / startsWith('https://') convention used
 * in hibernation.ts isDiscardable() (Phase 5 D-06 guard).
 */
export function isInjectable(url: string | undefined): boolean {
  if (!url) return false
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  return !RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix))
}
