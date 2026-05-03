export const ALARM_NAME = 'HIBERNATE_CHECK' as const
export const TIMEOUT_MS = 45 * 60 * 1000        // 45 min — Phase 2: default only; runtime reads timeout_minutes from storage
export const FORM_PROTECTION_MS = 5 * 60 * 1000 // 5 minutes

export const DEFAULT_TIMEOUT_MINUTES = 45        // default value for timeout_minutes storage key
export const RAM_PER_TAB_MB = 150               // estimated MB freed per hibernated tab (conservative)
export const THUMBNAIL_MAX_SIZE_BYTES = 250 * 1024   // 250 KB WebP size cap per thumbnail
export const IDB_SIZE_CAP_BYTES = 25 * 1024 * 1024  // 25 MB total IndexedDB thumbnails cap
