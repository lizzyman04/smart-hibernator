// Content script: captures scroll + form state and restores it on wake.
// No imports — content scripts are standalone globals-only files in this project.
// Constants are inlined (identical values to src/shared/constants.ts).

// ── D-06: Restricted-URL guard ─────────────────────────────────────────────
// Inlined denylist (identical values to src/shared/restricted-urls.ts).
// Content scripts are import-free — constants are duplicated here per project convention
// (same pattern as DEBOUNCE_MS/MAX_FIELDS being inlined from shared/constants.ts).
// IN-03: exported so a test can assert parity with shared/restricted-urls.ts
// RESTRICTED_PREFIXES. The two lists are hand-kept copies (content scripts are
// import-free by project convention); the parity test prevents silent desync.
export const INLINED_RESTRICTED_PREFIXES = [
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

// Check the current page URL before any listener registration or messaging.
// On restricted pages (chrome://, extension pages, CWS store), this flag is false
// and all event listener registration and sendMessage calls are skipped (no console errors).
const _href = (typeof location !== 'undefined' ? location.href : '') ?? ''
const _isPageInjectable: boolean =
  (_href.startsWith('http://') || _href.startsWith('https://')) &&
  !INLINED_RESTRICTED_PREFIXES.some((p) => _href.startsWith(p))

// ── End D-06 guard ─────────────────────────────────────────────────────────

const WATCHED_SELECTORS = 'input, textarea, select'

// Phase 4 — State Restoration constants (identical to shared/constants.ts)
const DEBOUNCE_MS = 500          // D-01: scroll/input debounce interval
const RESTORE_CAP_MS = 550       // D-07: MutationObserver cap (50ms under FR-12 600ms budget)
const MAX_FIELDS = 50            // Pitfall 6: field count cap per snapshot
const MAX_FIELD_VALUE_LEN = 10000 // Pitfall 6: per-field value length cap (chars)

// Local structural type matching shared/types.ts FieldSnapshot / TabStateSnapshot
type LocalFieldSnapshot = {
  id?: string
  name?: string
  selectorPath?: string
  value: string
  type: string
}

type LocalTabStateSnapshot = {
  tabId: number
  url: string
  scroll: { x: number; y: number }
  fields: LocalFieldSnapshot[]
  capturedAt: number
}

// D-03: Safe input types to capture
const CAPTURE_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'number', 'date',
  'datetime-local', 'month', 'week', 'time', 'color', 'range',
])

// D-03: Autocomplete values to exclude (sensitive fields)
const EXCLUDE_AUTOCOMPLETE = new Set([
  'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month',
  'cc-exp-year', 'cc-name', 'cc-type', 'one-time-code', 'new-password',
])

// ── Existing FORM_ACTIVITY behavior (preserved) ────────────────────────────

function reportFormActivity(): void {
  chrome.runtime.sendMessage({
    type: 'FORM_ACTIVITY',
    timestamp: Date.now(),
  }).catch(() => {
    // SW may be starting up; message is best-effort
  })
}

if (_isPageInjectable) {
  document.addEventListener('keydown', (e) => {
    if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
      reportFormActivity()
    }
  })
}

// ── Capture path ──────────────────────────────────────────────────────────

/**
 * Returns false for sensitive fields (D-03):
 * - type password/hidden/file
 * - autocomplete cc-* / one-time-code / new-password
 * Returns true for text-like, checkbox, radio, textarea, select.
 */
export function shouldCapture(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase()
    if (t === 'password' || t === 'hidden' || t === 'file') return false
    const ac = el.getAttribute('autocomplete') ?? ''
    if (ac.startsWith('cc-') || EXCLUDE_AUTOCOMPLETE.has(ac)) return false
    return CAPTURE_INPUT_TYPES.has(t) || t === 'checkbox' || t === 'radio'
  }
  // textarea and select are always captured
  return true
}

/**
 * Builds a CSS selector path from el to document.body.
 * Used only when element has neither id nor name (D-04 fallback).
 *
 * WR-04: uses :nth-of-type (count among same-tag siblings) rather than :nth-child
 * (count among ALL sibling element types). :nth-of-type is more stable when a parent
 * mixes element types, reducing — though not eliminating — the chance of a non-unique
 * path. resolveField additionally rejects ambiguous paths (more than one match) to
 * prevent a wrong-field write when two structurally similar subtrees still collide.
 */
export function getCssSelectorPath(el: Element): string {
  const path: string[] = []
  let node: Element | null = el
  while (node && node !== document.body) {
    const parent = node.parentElement
    if (!parent) break
    const tag = node.tagName.toLowerCase()
    const sameTagSiblings = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === tag,
    )
    const index = sameTagSiblings.indexOf(node) + 1
    path.unshift(`${tag}:nth-of-type(${index})`)
    node = parent
  }
  return path.join(' > ')
}

/**
 * Collects current scroll position and includable form field values.
 * Caps at MAX_FIELDS; truncates values to MAX_FIELD_VALUE_LEN.
 */
export function captureState(): { scroll: { x: number; y: number }; fields: LocalFieldSnapshot[] } {
  const scroll = { x: window.scrollX, y: window.scrollY }
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    WATCHED_SELECTORS,
  )
  const fields: LocalFieldSnapshot[] = []
  for (const el of inputs) {
    if (!shouldCapture(el)) continue
    const value =
      el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
        ? String(el.checked)
        : (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
    fields.push({
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      selectorPath: (!el.id && !el.getAttribute('name')) ? getCssSelectorPath(el) : undefined,
      value: value.slice(0, MAX_FIELD_VALUE_LEN),
      type: el.tagName.toLowerCase() + (el instanceof HTMLInputElement ? `[${el.type}]` : ''),
    })
    if (fields.length >= MAX_FIELDS) break
  }
  return { scroll, fields }
}

/**
 * Sends SAVE_STATE to SW (fire-and-forget, best-effort).
 */
function sendSnapshot(): void {
  const { scroll, fields } = captureState()
  chrome.runtime.sendMessage({
    type: 'SAVE_STATE',
    url: location.href,
    scroll,
    fields,
  }).catch(() => {
    // SW may be starting up or sleeping; SAVE_STATE is best-effort
  })
}

// Debounce state
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCapture(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(sendSnapshot, DEBOUNCE_MS)
}

if (_isPageInjectable) {
  // Capture triggers: scroll, input, change
  window.addEventListener('scroll', scheduleCapture, { passive: true })

  document.addEventListener('input', (e) => {
    // Also triggers existing FORM_ACTIVITY for form protection
    if ((e.target as Element)?.matches(WATCHED_SELECTORS)) {
      reportFormActivity()
    }
    scheduleCapture()
  })

  document.addEventListener('change', scheduleCapture, { passive: true })

  // Flush on pagehide (navigation, potential discard)
  window.addEventListener('pagehide', () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    sendSnapshot()
  })

  // Flush on visibilitychange → hidden (tab backgrounded)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
      sendSnapshot()
    }
  })
}

// ── Restore path ──────────────────────────────────────────────────────────

/**
 * Resolves a stored field descriptor to a live DOM element.
 * Priority: id → name → selectorPath → null (skip, D-04).
 */
export function resolveField(field: LocalFieldSnapshot): Element | null {
  if (field.id) return document.getElementById(field.id)
  if (field.name) {
    // CSS.escape may not be available in all environments; fall back to manual escaping
    const escapedName = (typeof CSS !== 'undefined' && CSS.escape)
      ? CSS.escape(field.name)
      : field.name.replace(/"/g, '\\"')
    return document.querySelector(`[name="${escapedName}"]`)
  }
  if (field.selectorPath) {
    // WR-04: a generated selectorPath can be non-unique (repeated form rows /
    // component-based pages). querySelector would return the FIRST match, which may
    // be a different field than the one captured — silently writing the saved value
    // into the wrong field. Only resolve when exactly one element matches; an ambiguous
    // path is skipped (treated as unresolvable) rather than risking a wrong-field write.
    const matches = document.querySelectorAll(field.selectorPath)
    return matches.length === 1 ? matches[0] : null
  }
  return null
}

/**
 * Applies a stored field value to a live DOM element.
 * Checkbox/radio: sets .checked; others: sets .value.
 */
export function applyFieldValue(
  el: Element,
  field: LocalFieldSnapshot,
): void {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    el.checked = field.value === 'true'
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    el.value = field.value
  }
}

/**
 * Applies scroll (via requestAnimationFrame) and all resolvable form fields.
 * Idempotent — safe to call multiple times.
 */
export function applyState(snapshot: LocalTabStateSnapshot): void {
  requestAnimationFrame(() => window.scrollTo(snapshot.scroll.x, snapshot.scroll.y))
  for (const field of snapshot.fields) {
    const el = resolveField(field)
    if (!el) continue
    applyFieldValue(el, field)
  }
}

/**
 * Returns true when every field in the snapshot resolves to a non-null element.
 */
export function allFieldsResolved(snapshot: LocalTabStateSnapshot): boolean {
  return snapshot.fields.every(f => resolveField(f) !== null)
}

/**
 * Starts the bounded MutationObserver restore loop.
 * Sets history.scrollRestoration = 'manual' ONLY here (Pitfall 7).
 * Observer disconnects early if all fields resolve, or at RESTORE_CAP_MS cap (FR-12).
 */
export function startRestore(snapshot: LocalTabStateSnapshot): void {
  // Only set scrollRestoration when a snapshot exists (Pitfall 7)
  history.scrollRestoration = 'manual'
  applyState(snapshot)

  const capTimer = setTimeout(() => observer.disconnect(), RESTORE_CAP_MS)

  const observer = new MutationObserver(() => {
    applyState(snapshot)
    if (allFieldsResolved(snapshot)) {
      clearTimeout(capTimer)
      observer.disconnect()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// ── GET_STATE pull on module load (D-08) ─────────────────────────────────

// Callback overload (NOT Promise form) — Chrome 120 compat (COMP-01)
// Guard: only pull state on injectable pages (D-06)
if (_isPageInjectable) {
  chrome.runtime.sendMessage({ type: 'GET_STATE', url: location.href }, (snapshot) => {
    if (chrome.runtime.lastError) return   // SW not ready — skip restore
    if (!snapshot) return                  // no stored state for this tab
    startRestore(snapshot as LocalTabStateSnapshot)
  })
}
