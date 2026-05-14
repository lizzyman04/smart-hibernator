// Behavioral event recording and per-domain bias adjustment for AI learning.
// Per D-09 (implicit + explicit learning signals), D-10 (domain threshold adjustment),
// D-14 (Keep Alive as strong Vital signal), T-03-11 (bias clamping), T-03-13 (Map cleanup),
// T-03-14 (misclassification window short-circuit).
import { getDomainBias, putDomainBias, appendTabHistory } from './idb'
import type { DomainBiasRecord, TabHistoryRecord } from '../shared/types'
import { AI_WAKE_SIGNAL_WINDOW_MS, AI_BIAS_MAX } from '../shared/constants'

// ─── Module-level visit tracking maps (never inside event handlers) ──────────

/** tabId → visitStart unix ms — tracks open visit windows */
const openVisits = new Map<number, number>()

/** tabId → last-known url — snapshot at recordTabActivation; used when chrome.tabs.get fails */
const openUrls = new Map<number, string>()

// ─── Test-only helper ────────────────────────────────────────────────────────

/** Reset both visit maps — call in beforeEach to keep tests deterministic */
export function __resetOpenVisitMaps(): void {
  openVisits.clear()
  openUrls.clear()
}

// ─── Explicit learning signal (D-09, D-14, T-03-11) ─────────────────────────

/**
 * Record a Keep Alive signal for a domain — increases biasOffset by 0.2 (strong Vital signal).
 * Clamps biasOffset to AI_BIAS_MAX to prevent model poisoning (T-03-11).
 */
export async function recordKeepAlive(tabId: number, domain: string): Promise<void> {
  try {
    const existing = await getDomainBias(domain)
    const rawBias = existing?.biasOffset ?? 0
    const safeBias = Number.isNaN(rawBias) ? 0 : rawBias
    const next: DomainBiasRecord = {
      domain,
      biasOffset: Math.min(AI_BIAS_MAX, safeBias + 0.2),
      keepAliveCount: (existing?.keepAliveCount ?? 0) + 1,
      misclassificationCount: existing?.misclassificationCount ?? 0,
      updatedAt: Date.now(),
    }
    await putDomainBias(next)
  } catch {
    // IDB failure — silently continue; bias update is best-effort
  }
}

// ─── Visit window tracking (D-09 behavioral history) ─────────────────────────

/**
 * Record tab activation — opens a visit window.
 * Synchronous — does NOT await IDB; the close call writes the record.
 * If the tab is already tracked, update the url snapshot but keep the original visitStart.
 */
export function recordTabActivation(tabId: number, timestamp: number, url: string): void {
  if (openVisits.has(tabId)) {
    // Re-activation without closure — update url snapshot so close path uses the latest url
    openUrls.set(tabId, url)
  } else {
    openVisits.set(tabId, timestamp)
    openUrls.set(tabId, url)
  }
}

/**
 * Close a visit window and append a TabHistoryRecord to IDB.
 * Cleans up both maps on call (T-03-13 — Map is bounded by open tab count).
 * Returns silently if no open visit exists for the tabId.
 */
export async function closeTabVisit(tabId: number, hadFormActivity: boolean): Promise<void> {
  const visitStart = openVisits.get(tabId)
  if (!visitStart) return // no open visit or already closed

  const url = openUrls.get(tabId) ?? ''

  // T-03-13: delete map entries immediately to prevent memory growth
  openVisits.delete(tabId)
  openUrls.delete(tabId)

  if (!url) return // no url snapshot — cannot build a domain record

  try {
    const domain = new URL(url).hostname
    if (!domain) return
    const visitEnd = Date.now()
    const record: TabHistoryRecord = {
      domain,
      url,
      visitStart,
      visitEnd,
      dwellMs: visitEnd - visitStart,
      hadFormActivity,
      timestamp: visitStart,
    }
    await appendTabHistory(record)
  } catch {
    // Invalid URL or IDB failure — silently continue
  }
}

// ─── Implicit learning signal (D-09, T-03-14) ────────────────────────────────

/**
 * Record an implicit misclassification signal — a hibernated tab was woken within
 * AI_WAKE_SIGNAL_WINDOW_MS of being discarded (D-09 implicit signal).
 *
 * T-03-14: Only writes bias if the existing record's updatedAt is within the short window.
 * Cold start (no existing record): treat updatedAt as 0 — always write the initial signal,
 * since the wake itself starts the bias trail per D-09.
 */
export async function recordWakeMisclassification(domain: string): Promise<void> {
  try {
    const existing = await getDomainBias(domain)
    const priorUpdatedAt = existing?.updatedAt ?? 0

    // T-03-14: short-circuit if the last bias update is outside the signal window
    if (existing && Date.now() - priorUpdatedAt > AI_WAKE_SIGNAL_WINDOW_MS) return

    const rawBias = existing?.biasOffset ?? 0
    const safeBias = Number.isNaN(rawBias) ? 0 : rawBias
    const next: DomainBiasRecord = {
      domain,
      biasOffset: Math.min(AI_BIAS_MAX, safeBias + 0.1), // weaker than Keep Alive's 0.2
      keepAliveCount: existing?.keepAliveCount ?? 0,
      misclassificationCount: (existing?.misclassificationCount ?? 0) + 1,
      updatedAt: Date.now(),
    }
    await putDomainBias(next)
  } catch {
    // IDB failure — silently continue
  }
}
