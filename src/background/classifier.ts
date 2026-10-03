// Tab vitality classifier — feature vector assembly, offscreen lifecycle, batch classification.
// Analog: src/background/thumbnail.ts (same service utility role in SW context).
// Per RESEARCH.md Patterns 1, 3, 6; Pitfalls 2 and 5; D-02, D-07, D-11, T-03-06/07/09.
// Phase 5: D-01/D-05 idle teardown + pending ref-count guard (Pattern 1).
// G-05-1: freshness gate — classifyBatch only runs inference (and only creates the offscreen
// document) when at least one candidate's cached classification is stale, so an idle browser
// stops re-arming the idle teardown every alarm tick.
import { getTabHistoryByDomain, getDomainBias, countTabHistory } from './idb'
import {
  AI_COLD_START_MIN_SAMPLES,
  AI_HISTORY_WINDOW_MS,
  VITAL_DOMAINS,
  DEAD_DOMAINS,
  OFFSCREEN_IDLE_MS,
  AI_CLASSIFICATION_TTL_MS,
  OFFSCREEN_IDLE_ALARM,
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

// ─── Classification freshness gate (G-05-1) ─────────────────────────────────

/**
 * Signature of the EVENT-DRIVEN inputs to a classification: hostname, form activity (f2),
 * domain category boost (f3) and learned domain bias (f4, 3 decimals).
 * The drifting features (0 revisitFreq, 1 dwellTime, 5 recency) are deliberately excluded:
 * they change during idle via time and history aging, and including them would recreate the
 * per-tick bursts this gate removes. Their drift is bounded by AI_CLASSIFICATION_TTL_MS.
 */
export function classificationFeatureKey(url: string, features: number[]): string {
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    hostname = ''
  }
  return [hostname, features[2], features[3], features[4].toFixed(3)].join('|')
}

/**
 * True when a cached classification must be re-inferred. Missing, non-finite or future
 * inferredAt, a missing/different featureKey, a tab activation after inference, or TTL expiry
 * all count as stale (T-05-06-03).
 */
export function isClassificationStale(
  entry: ClassificationResult | undefined,
  featureKey: string,
  meta: TabMeta,
  now: number
): boolean {
  if (!entry) return true
  const inferredAt = entry.inferredAt
  if (typeof inferredAt !== 'number' || !Number.isFinite(inferredAt)) return true
  if (inferredAt > now) return true
  if (now - inferredAt >= AI_CLASSIFICATION_TTL_MS) return true
  if (meta.lastActiveAt > inferredAt) return true
  if (entry.featureKey !== featureKey) return true
  return false
}

// ─── Offscreen Document lifecycle (RESEARCH Pattern 1 + Pitfall 2 / T-03-09) ─
// Phase 5 additions: D-01 idle teardown + D-05 in-flight race guard.
//
// Architecture:
//   pending    — ref-count spanning ensureOffscreen() plus the CLASSIFY_BATCH round-trip
//                (D-05 correctness requirement)
//   idle alarm — one-shot chrome.alarms alarm OFFSCREEN_IDLE_ALARM at now + OFFSCREEN_IDLE_MS;
//                re-created (same name replaces the pending alarm) after each burst and when
//                a document is created. index.ts routes it to teardownIfIdle().
//
// NOTE: The original design used an in-memory SW setTimeout on the premise that losing the
// timer on SW suspension is harmless because Chrome closes the document anyway. UAT G-05-1
// disproved that: the document persisted 13+ idle minutes, and WORKERS-reason offscreen
// documents outlive the SW. Chrome persists alarms across SW suspension, so teardown is now
// alarm-scheduled. This deliberately supersedes the 05-RESEARCH.md anti-pattern against using
// an alarm for teardown. No manifest change is needed (the alarms permission is already
// declared and justified per D-04), and a mid-burst firing is neutralized by the `pending`
// guard plus the in-flight burst's finally re-arm.
// Never scatter closeDocument() into hibernation.ts or index.ts — this file is the lifecycle
// chokepoint.
//
// G-05-1 freshness gate: classifyBatch only touches the document when a candidate is stale,
// so an idle browser stops re-arming the window every tick.

/** Module-level promise guard prevents concurrent createDocument calls */
let creatingOffscreen: Promise<void> | null = null

/** D-05: ref-count of active offscreen bursts — teardownIfIdle early-returns when > 0 */
let pending = 0

/**
 * (Re)schedule the idle-teardown alarm for now + OFFSCREEN_IDLE_MS. Creating an alarm with an
 * existing name replaces it, so each burst resets the window, but unlike a SW timer Chrome
 * persists it across service-worker suspension (G-05-1). Failures are swallowed.
 */
async function armIdleTeardown(): Promise<void> {
  try {
    await chrome.alarms.create(OFFSCREEN_IDLE_ALARM, { when: Date.now() + OFFSCREEN_IDLE_MS })
  } catch {
    /* alarms unavailable — document will be reclaimed on the next burst's arm */
  }
}

/**
 * Tear down the offscreen document when no classification is in flight (D-01 / D-05).
 * 1. Early-returns when pending > 0 — never closes while CLASSIFY_BATCH is in progress.
 * 2. Sends RELEASE_SESSION to let the offscreen doc release() the ORT session (belt).
 * 3. Calls closeDocument() to destroy the WASM context and reclaim RAM (suspenders = NFR-01 lever).
 * Both steps are individually try/catch-swallowed because the doc may already be gone.
 * Exported so index.ts can route the OFFSCREEN_IDLE_ALARM alarm to it.
 */
export async function teardownIfIdle(): Promise<void> {
  if (pending > 0) return // D-05: never tear down mid-inference (T-05-01)
  try { await chrome.runtime.sendMessage({ type: 'RELEASE_SESSION' }) } catch { /* doc may be gone */ }
  try { await chrome.offscreen.closeDocument() } catch { /* already closed */ }
}

/**
 * Ensure the Offscreen Document is alive before sending CLASSIFY_BATCH messages.
 * Uses chrome.runtime.getContexts() check + promise guard (Pitfall 2 / T-03-09).
 * Never called at SW boot (D-01 recreate-on-demand): classifyBatch calls it only for a burst.
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
  const creation = chrome.offscreen.createDocument({
    url: 'src/offscreen/index.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run ONNX Runtime Web for local tab vitality classification',
  })
  creatingOffscreen = creation
  try {
    await creation
    // Schedule teardown from the document's birth, even if the SW dies before the burst's
    // finally runs (G-05-1). Not armed on the early return where the document already exists.
    await armIdleTeardown()
  } finally {
    // Always clear — a failed attempt must not poison subsequent calls (CR-01).
    // A rejected promise left cached here would wedge every later ensureOffscreen()
    // for the rest of the SW lifetime, silently killing the classifier.
    if (creatingOffscreen === creation) creatingOffscreen = null
  }
}

// ─── Batch classification + storage cache (RESEARCH Pattern 6 / T-03-06) ───

/**
 * Classify a batch of candidate tabs, cache results in chrome.storage.local,
 * and prune stale tabIds from the cache (T-03-06 storage quota mitigation).
 *
 * G-05-1 freshness gate: inference (and offscreen document creation) only happens when at
 * least one candidate is stale (see isClassificationStale). A burst re-infers ALL kept
 * candidates so inferredAt values stay aligned. On a fully fresh batch only cachedAt is
 * refreshed (Phase 3 wake-misclassification window) and no offscreen work is done.
 *
 * Silently no-ops on any error (same pattern as thumbnail.ts captureAndStore).
 */
export async function classifyBatch(
  candidateTabs: Array<{ tabId: number; url: string; meta: TabMeta }>
): Promise<void> {
  if (candidateTabs.length === 0) return

  try {
    // Read the cache once up front. classifyBatch is the sole writer of ai_classifications,
    // so the longer read-modify-write window is safe.
    const current = await chrome.storage.local.get('ai_classifications')
    const cache =
      ((current['ai_classifications'] as Record<number, ClassificationResult>) ?? {})

    // Build feature vectors for all candidates in parallel; filter out nulls (cold start).
    // Cold start returns here, BEFORE any offscreen work, so it never creates the document.
    const built = await Promise.all(
      candidateTabs.map(async ({ tabId, url, meta }) => {
        const features = await buildFeaturesForTab(tabId, url, meta)
        return features
          ? { tabId, features, meta, featureKey: classificationFeatureKey(url, features) }
          : null
      })
    )
    const kept = built.filter((p): p is NonNullable<typeof p> => p !== null)
    if (kept.length === 0) return

    const now = Date.now()
    const burst = kept.some((k) => isClassificationStale(cache[k.tabId], k.featureKey, k.meta, now))

    if (burst) {
      // D-05: pending spans ensureOffscreen() AND the CLASSIFY_BATCH round-trip so
      // teardownIfIdle cannot slip in between the create and the send (T-05-01).
      pending++
      let response: { results?: Array<{ tabId: number; label: TabVitality | null; confidence: number }> } | undefined
      try {
        await ensureOffscreen()
        response = (await chrome.runtime.sendMessage({
          type: 'CLASSIFY_BATCH',
          tabs: kept.map(({ tabId, features }) => ({ tabId, features })),
        })) as { results?: Array<{ tabId: number; label: TabVitality | null; confidence: number }> } | undefined
      } finally {
        pending--
        await armIdleTeardown() // D-01: re-schedule the alarm after each burst; resets the window
      }

      // WR-01: validate the response shape before iterating (sendMessage can resolve undefined).
      const results = Array.isArray(response?.results) ? response.results : []
      if (results.length === 0) return

      const keyByTab = new Map(kept.map((k) => [k.tabId, k.featureKey]))
      for (const r of results) {
        cache[r.tabId] = {
          label: r.label,
          confidence: r.confidence,
          cachedAt: now,
          inferredAt: now,
          featureKey: keyByTab.get(r.tabId),
        }
      }
    } else {
      // Fully fresh: refresh cachedAt only (keeps the index.ts wake-misclassification window
      // alive); no ensureOffscreen / sendMessage / armIdleTeardown.
      for (const k of kept) {
        const entry = cache[k.tabId]
        if (entry) cache[k.tabId] = { ...entry, cachedAt: now }
      }
    }

    // Prune stale entries — remove tabIds no longer in current open tabs (T-03-06)
    const openTabs = await chrome.tabs.query({})
    const openTabIds = new Set(openTabs.map((t) => t.id).filter((id): id is number => id !== undefined))
    for (const key of Object.keys(cache)) {
      if (!openTabIds.has(Number(key))) {
        delete cache[Number(key)]
      }
    }

    await chrome.storage.local.set({ ai_classifications: cache })
  } catch {
    // Offscreen document may not be ready — silently skip; next alarm tick will retry
  }
}
