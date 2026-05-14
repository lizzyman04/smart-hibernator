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
