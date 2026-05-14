// Tab vitality classifier — feature vector assembly, offscreen lifecycle, batch classification.
// Analog: src/background/thumbnail.ts (same service utility role in SW context).
// Per RESEARCH.md Patterns 1, 3, 6; Pitfalls 2 and 5; D-02, D-07, D-11, T-03-06/07/09.
import { getTabHistoryByDomain, getDomainBias, countTabHistory } from './idb'
import {
  AI_COLD_START_MIN_SAMPLES,
  AI_HISTORY_WINDOW_MS,
  VITAL_DOMAINS,
  DEAD_DOMAINS,
} from '../shared/constants'
import type { ClassificationResult, TabMeta, TabVitality } from '../shared/types'

// ─── Domain heuristic preset (D-02) ─────────────────────────────────────────

/**
 * Return +1 for preset vital domains, -1 for dead domains, 0 for neutral.
 * This is one element of the 6-feature vector sent to the ONNX classifier.
 */
export function getDomainCategoryBoost(domain: string): number {
  if (VITAL_DOMAINS.includes(domain)) return +1
  if (DEAD_DOMAINS.includes(domain)) return -1
  return 0
}

// ─── Feature vector assembly (RESEARCH Pattern 3 + Pitfall 5) ──────────────

/**
 * Build a 6-element normalized float vector for `tabId` based on behavioral history.
 * Returns null during cold start (totalRows < AI_COLD_START_MIN_SAMPLES) or on error.
 *
 * Vector layout (matches skl2onnx initial_types):
 *   [0] revisitFreq       — visits in 14-day window, normalized to [0, 1] (cap: 30 visits)
 *   [1] dwellTime         — avg dwell (ms) normalized to [0, 1] (cap: 1 hour)
 *   [2] formActivity      — 0 or 1 (meta.lastFormActivity truthy)
 *   [3] domainCategoryBoost — -1, 0, or +1 (preset domain heuristic, D-02)
 *   [4] domainBiasOffset  — per-domain learned bias, clamped to [-1, 1] (T-03-07)
 *   [5] recency           — hours since most recent visit, normalized to [0, 1] (cap: 336 h = 14 d)
 */
export async function buildFeaturesForTab(
  tabId: number,
  url: string,
  meta: TabMeta
): Promise<number[] | null> {
  // Cold-start gate — AI skips classification until enough history is collected (D-11)
  const totalRows = await countTabHistory()
  if (totalRows < AI_COLD_START_MIN_SAMPLES) return null

  // Use thumbnail.ts try-catch idiom: silent failure returns null
  try {
    const domain = new URL(url).hostname
    const since = Date.now() - AI_HISTORY_WINDOW_MS
    const history = await getTabHistoryByDomain(domain, since)
    const bias = await getDomainBias(domain)

    // Feature 0: revisit frequency (max 30 visits in 14 days = 1.0)
    const revisitFreq = Math.min(history.length / 30, 1)

    // Feature 1: average dwell time, normalized to 1 hour (3600 * 1000 ms)
    const avgDwellMs =
      history.length > 0
        ? history.reduce((sum, r) => sum + r.dwellMs, 0) / history.length
        : 0
    const dwellTime = Math.min(avgDwellMs / (3600 * 1000), 1)

    // Feature 2: form activity flag (0 or 1)
    const formActivity = meta.lastFormActivity ? 1 : 0

    // Feature 3: domain category boost (-1, 0, or +1)
    const domainCategoryBoost = getDomainCategoryBoost(domain)

    // Feature 4: per-domain learned bias, clamped to [-1, 1] (T-03-07 mitigation)
    let domainBiasOffset = 0
    if (bias !== undefined) {
      const raw = bias.biasOffset
      domainBiasOffset = Number.isNaN(raw) ? 0 : Math.max(-1, Math.min(1, raw))
    }

    // Feature 5: recency — hours since most recent visit (cap: 336 h = 14 days)
    const hoursSinceLast =
      history.length > 0
        ? (Date.now() - Math.max(...history.map((r) => r.timestamp))) / (1000 * 3600)
        : 336 // maximum staleness signal when no history
    const recency = Math.min(hoursSinceLast / 336, 1)

    return [revisitFreq, dwellTime, formActivity, domainCategoryBoost, domainBiasOffset, recency]
  } catch {
    // Invalid URL or IDB failure — silently return null (same pattern as thumbnail.ts compressToWebP)
    return null
  }
}

// ─── Offscreen Document lifecycle (RESEARCH Pattern 1 + Pitfall 2 / T-03-09) ─

/** Module-level promise guard prevents concurrent createDocument calls */
let creatingOffscreen: Promise<void> | null = null

/**
 * Ensure the Offscreen Document is alive before sending CLASSIFY_BATCH messages.
 * Uses chrome.runtime.getContexts() check + promise guard (Pitfall 2 / T-03-09).
 * Exported so index.ts can call it at SW startup.
 */
export async function ensureOffscreen(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('src/offscreen/index.html')
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  })

  // Document already exists — nothing to do
  if (contexts.length > 0) return

  // Race guard: if another call is already creating the document, await it
  if (creatingOffscreen) {
    await creatingOffscreen
    return
  }

  // First caller: create the document
  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'src/offscreen/index.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run ONNX Runtime Web for local tab vitality classification',
  })
  await creatingOffscreen
  creatingOffscreen = null
}

// ─── Batch classification + storage cache (RESEARCH Pattern 6 / T-03-06) ───

/**
 * Classify a batch of candidate tabs, cache results in chrome.storage.local,
 * and prune stale tabIds from the cache (T-03-06 storage quota mitigation).
 *
 * Silently no-ops on any error (same pattern as thumbnail.ts captureAndStore).
 */
export async function classifyBatch(
  candidateTabs: Array<{ tabId: number; url: string; meta: TabMeta }>
): Promise<void> {
  if (candidateTabs.length === 0) return

  try {
    // Ensure Offscreen Document is alive before sending the message
    await ensureOffscreen()

    // Build feature vectors for all candidates in parallel; filter out nulls (cold start)
    const payloads = await Promise.all(
      candidateTabs.map(async ({ tabId, url, meta }) => {
        const features = await buildFeaturesForTab(tabId, url, meta)
        return features ? { tabId, features } : null
      })
    )
    const toClassify = payloads.filter(
      (p): p is { tabId: number; features: number[] } => p !== null
    )

    if (toClassify.length === 0) return

    const response = (await chrome.runtime.sendMessage({
      type: 'CLASSIFY_BATCH',
      tabs: toClassify,
    })) as { results: Array<{ tabId: number; label: TabVitality | null; confidence: number }> }

    // Read existing classification cache
    const current = await chrome.storage.local.get('ai_classifications')
    const cache =
      ((current['ai_classifications'] as Record<number, ClassificationResult>) ?? {})

    // Prune stale entries — remove tabIds no longer in current open tabs (T-03-06)
    const openTabs = await chrome.tabs.query({})
    const openTabIds = new Set(openTabs.map((t) => t.id).filter((id): id is number => id !== undefined))
    for (const key of Object.keys(cache)) {
      if (!openTabIds.has(Number(key))) {
        delete cache[Number(key)]
      }
    }

    // Write new classification results into cache
    const now = Date.now()
    for (const r of response.results) {
      cache[r.tabId] = { label: r.label, confidence: r.confidence, cachedAt: now }
    }

    await chrome.storage.local.set({ ai_classifications: cache })
  } catch {
    // Offscreen document may not be ready — silently skip; next alarm tick will retry
  }
}
