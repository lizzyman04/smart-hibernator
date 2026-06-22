// D-02: Dev-only memory probe helper
// Logs memory usage via performance.measureUserAgentSpecificMemory() in dev builds.
// Gate of record = manual Chrome Task Manager (Shift+Esc); this is visibility-only.
//
// Guards:
//   1. import.meta.env.DEV — zero probe code in production builds (NFR-04 cleanliness)
//   2. crossOriginIsolated — measureUserAgentSpecificMemory() requires COI; the extension
//      intentionally runs numThreads=1 to avoid COI, so probe is usually unavailable
//      (RESEARCH Pitfall 2). Probe-unavailable is the expected case, not a bug.
//   3. typeof fn === 'function' — defensive check in case the API is absent
//
// Never throws — all paths console.debug only (NFR-04: zero telemetry, local logs only).

/**
 * Log memory usage for the current context to console.debug (dev builds only).
 * Returns immediately (does NOT throw) when:
 *   - Running in a production build (import.meta.env.DEV is false/undefined)
 *   - globalThis.crossOriginIsolated is not strictly true
 *   - performance.measureUserAgentSpecificMemory is not a function
 *
 * @param tag  Short label identifying the call site (e.g. 'after-session-init')
 */
export async function logMemoryProbe(tag: string): Promise<void> {
  if (!import.meta.env.DEV) return

  const coi = (globalThis as any).crossOriginIsolated === true
  const fn = (performance as any).measureUserAgentSpecificMemory

  if (!coi || typeof fn !== 'function') {
    console.debug(
      `[smart-hibernator/mem] ${tag}: probe unavailable (crossOriginIsolated=${coi}) — use Task Manager gate`
    )
    return
  }

  try {
    const r = await fn.call(performance)
    console.debug(
      `[smart-hibernator/mem] ${tag}: ${(r.bytes / 1048576).toFixed(1)} MB`,
      r.breakdown
    )
  } catch (e) {
    console.debug(`[smart-hibernator/mem] ${tag}: probe error`, e)
  }
}
