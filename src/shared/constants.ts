export const ALARM_NAME = 'HIBERNATE_CHECK' as const
export const TIMEOUT_MS = 45 * 60 * 1000        // 45 min — Phase 2: default only; runtime reads timeout_minutes from storage
export const FORM_PROTECTION_MS = 5 * 60 * 1000 // 5 minutes

export const DEFAULT_TIMEOUT_MINUTES = 45        // default value for timeout_minutes storage key
export const RAM_PER_TAB_MB = 150               // estimated MB freed per hibernated tab (conservative)
export const THUMBNAIL_MAX_SIZE_BYTES = 250 * 1024   // 250 KB WebP size cap per thumbnail
export const IDB_SIZE_CAP_BYTES = 25 * 1024 * 1024  // 25 MB total IndexedDB thumbnails cap

// Phase 3 — AI Intelligence constants

/** Minimum classifier confidence to apply AI-derived timeout multiplier (D-07) */
export const AI_CONFIDENCE_THRESHOLD = 0.6

/** Minimum tab-history rows in IndexedDB before AI classification activates (Pitfall 5) */
export const AI_COLD_START_MIN_SAMPLES = 50

/** Rolling window for behavioral history — 14 days in milliseconds (D-03) */
export const AI_HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** Window after hibernation during which a wake event counts as a misclassification signal (D-09) */
export const AI_WAKE_SIGNAL_WINDOW_MS = 5 * 60 * 1000

/** Maximum domain bias offset — bias values are clamped to this ceiling */
export const AI_BIAS_MAX = 1.0

/** Days used for "AI tuning: X days remaining" countdown in Dashboard (FR-06) */
export const AI_LEARNING_DAYS = 14

/** Preset vital domains — these receive a +1 category boost in the feature vector (D-02) */
export const VITAL_DOMAINS: readonly string[] = [
  'github.com',
  'docs.google.com',
  'notion.so',
  'linear.app',
  'figma.com',
]

/** Preset dead domains — empty by default; user-driven via Keep Alive negative space (D-02) */
export const DEAD_DOMAINS: readonly string[] = []

// Phase 5 — Polishing & Launch constants

/** D-01: Idle window before tearing down the offscreen document (closeDocument).
 * ~10 min — far above the 1-min alarm period so an actively-classifying browser
 * never tears down between ticks. Only fires when genuinely idle (Pitfall 1). */
export const OFFSCREEN_IDLE_MS = 10 * 60 * 1000

/** G-05-1: Upper bound on how long a cached classification is reused without fresh inference.
 * Covers slow drift (recency, 14-day history aging, sibling-tab visits). It MUST exceed
 * OFFSCREEN_IDLE_MS so an idle browser reaches teardown and stays down; during long idle the
 * document lives roughly OFFSCREEN_IDLE_MS per TTL. Claude's discretion under D-01
 * (RAM saved vs cold-start frequency). */
export const AI_CLASSIFICATION_TTL_MS = 60 * 60 * 1000

/** G-05-1: Name of the one-shot chrome.alarms alarm that schedules the offscreen idle teardown.
 * Alarms persist across service-worker suspension, unlike an in-memory setTimeout. */
export const OFFSCREEN_IDLE_ALARM = 'OFFSCREEN_IDLE_TEARDOWN' as const

// Phase 4 — State Restoration constants

/** D-01: scroll/input debounce interval before sending SAVE_STATE to SW */
export const DEBOUNCE_MS = 500

/** D-07: MutationObserver cap for restore loop (50ms under FR-12 600ms budget) */
export const RESTORE_CAP_MS = 550

/** Pitfall 6: field count cap per snapshot — limits snapshot memory footprint */
export const MAX_FIELDS = 50

/** Pitfall 6: per-field value length cap in characters */
export const MAX_FIELD_VALUE_LEN = 10_000
