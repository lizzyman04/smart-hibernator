---
phase: 01-core-hibernation-engine
reviewed: 2026-04-30T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - components.json
  - manifest.json
  - package.json
  - playwright.config.ts
  - src/background/alarms.ts
  - src/background/badge.ts
  - src/background/contextMenus.ts
  - src/background/hibernation.test.ts
  - src/background/hibernation.ts
  - src/background/index.test.ts
  - src/background/index.ts
  - src/background/storage.ts
  - src/components/ui/badge.tsx
  - src/components/ui/button.tsx
  - src/components/ui/separator.tsx
  - src/components/ui/switch.tsx
  - src/content/form-watcher.ts
  - src/lib/utils.ts
  - src/popup/App.tsx
  - src/popup/index.css
  - src/popup/index.html
  - src/popup/main.tsx
  - src/shared/constants.ts
  - src/shared/types.ts
  - tests/e2e/extension.spec.ts
  - tests/e2e/fixtures.ts
  - tsconfig.json
  - vite.config.ts
  - vitest.config.ts
  - vitest.setup.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

This phase implements the core hibernation engine for Smart Hibernator, a Chrome MV3 extension. The codebase is well-structured overall: the service worker entry point follows MV3 listener registration rules correctly, `isDiscardable` has solid guard conditions, and the unit test suite has meaningful coverage. No security vulnerabilities or data-loss bugs were found.

Five warnings were identified — all relate to logic correctness or reliability risks:

1. **Race condition / stale-read in `handleAlarmTick`** — the `hibernated_count` read in storage and the final write can diverge from concurrent increments originating in the popup.
2. **Unhandled promise from `handleAlarmTick` in the alarm listener** — if the async function throws, the error is silently swallowed.
3. **`isDiscardable` fallback treats meta-less tabs as never-idle** — when no `TabMeta` exists the function defaults `lastActiveAt` to `now`, meaning a tab opened before the first SW start can never be discarded.
4. **`handleHibernateClick` in App.tsx reads `hibernatedCount` from stale React state** — creates an increment race when the storage listener and the button click overlap.
5. **`onInstalled` storage initialisation overwrites existing data on extension update** — `chrome.storage.local.set` on `update` reason resets `hibernated_count` and `tab_meta` to zero/empty, losing user data.

Four informational items are also noted (unused `scripting` permission, unused `Badge` component, non-null assertion in `main.tsx`, magic constant `1` in badge threshold).

---

## Warnings

### WR-01: Unhandled promise from `handleAlarmTick` in alarm listener

**File:** `src/background/index.ts:30-33`
**Issue:** `chrome.alarms.onAlarm.addListener` receives a synchronous callback. Inside it, `handleAlarmTick()` is called without `await` and without `.catch()`. Any rejection thrown inside `handleAlarmTick` (e.g. a storage error) is an unhandled promise rejection, which in MV3 service workers can cause the SW to be force-killed and may suppress the error entirely.

**Fix:**
```typescript
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    handleAlarmTick().catch((err) => console.error('[smart-hibernator] alarm tick failed', err))
  }
})
```

---

### WR-02: Race condition — stale `hibernated_count` in `handleAlarmTick`

**File:** `src/background/hibernation.ts:34-76`
**Issue:** `hibernated_count` is read at the top of the function (line 48), multiple `chrome.tabs.discard()` calls are awaited in sequence (lines 62-69), then the accumulated delta is written back (line 74). If the popup's `handleHibernateClick` writes an incremented count to storage while `handleAlarmTick` is mid-loop, `handleAlarmTick`'s final write will overwrite the popup's increment with the stale base value, silently losing a count.

This is an in-extension (same SW) write conflict only; it is low-frequency but real.

**Fix:** Use a delta-only update rather than overwriting the absolute value:
```typescript
// Instead of reading count at top and writing absolute value at bottom,
// write only the delta after all discards are done.
if (newDiscards > 0) {
  const fresh = await chrome.storage.local.get('hibernated_count')
  const freshCount = ((fresh['hibernated_count'] as number) ?? 0) + newDiscards
  await chrome.storage.local.set({ hibernated_count: freshCount })
  await updateBadge(freshCount)
}
```

---

### WR-03: `isDiscardable` treats tabs with no `TabMeta` as permanently active (wrong default)

**File:** `src/background/hibernation.ts:26`
**Issue:** When `meta` is `undefined` (no entry in `tab_meta`), `lastActive` defaults to `now`:
```typescript
const lastActive = meta?.lastActiveAt ?? now
```
This means a tab opened before the service worker's first run (or after a SW restart cleared the alarm without re-populating `tab_meta`) will always have `now - lastActive === 0`, which is less than `TIMEOUT_MS`, so it will never be discarded — regardless of how long it has been open. Tabs are only added to `tab_meta` via `onActivated`, so a tab that was open before the extension was installed, and has never been re-activated, will never be discarded.

**Fix:** Default to a timestamp old enough to trigger hibernation, or treat missing meta as "unknown" and default to the epoch / extension-install time:
```typescript
// Treat a tab with no recorded activity as having been last active at install time
// (conservative: use 0 so it is immediately eligible after the timeout window).
const lastActive = meta?.lastActiveAt ?? 0
```
If that is too aggressive, a reasonable alternative is to record `lastActiveAt: Date.now()` for all existing tabs during `onInstalled`, which also fixes the gap.

---

### WR-04: `handleHibernateClick` increments stale React state for `hibernated_count`

**File:** `src/popup/App.tsx:98`
**Issue:** On line 98, the new count is derived as `state.hibernatedCount + 1` where `state` is the React state snapshot captured at the time `handleHibernateClick` was called (via closure). If the storage-change listener fires between the time the button was clicked and `chrome.tabs.discard()` resolves, `state.hibernatedCount` may already be stale, causing a duplicate write that sets the count one lower than the true value.

**Fix:** Read the current count from storage immediately before writing, rather than from React state:
```typescript
const result = await chrome.storage.local.get('hibernated_count')
const currentCount = (result['hibernated_count'] as number) ?? 0
const newCount = currentCount + 1
await chrome.storage.local.set({ hibernated_count: newCount })
```
This mirrors the pattern already used correctly in `handleManualHibernate` in `hibernation.ts`.

---

### WR-05: `onInstalled` resets user data on extension `update`

**File:** `src/background/index.ts:17-26`
**Issue:** The `onInstalled` handler fires for both `install` and `update` reasons, and in both cases calls `chrome.storage.local.set` with hardcoded zero/empty values:
```typescript
chrome.storage.local.set({
  hibernation_enabled: true,
  hibernated_count: 0,   // <-- resets lifetime count on every update
  tab_meta: {},           // <-- discards all known tab activity
  protected_tabs: [],     // <-- clears user-configured protection
  protected_domains: [],  // <-- clears user-configured protection
})
```
On an extension update this will silently delete the user's `protected_tabs`, `protected_domains`, and `hibernated_count`. This is data loss from the user's perspective.

**Fix:** Only initialise missing keys on `update`, and do a full reset only on `install`:
```typescript
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      hibernation_enabled: true,
      hibernated_count: 0,
      tab_meta: {},
      protected_tabs: [],
      protected_domains: [],
    })
  } else if (reason === 'update') {
    // Only backfill keys that do not yet exist (forward-compatible migration)
    chrome.storage.local.get(
      ['hibernation_enabled', 'protected_tabs', 'protected_domains'],
      (existing) => {
        const defaults: Record<string, unknown> = {}
        if (existing['hibernation_enabled'] === undefined) defaults['hibernation_enabled'] = true
        if (existing['protected_tabs'] === undefined) defaults['protected_tabs'] = []
        if (existing['protected_domains'] === undefined) defaults['protected_domains'] = []
        if (Object.keys(defaults).length > 0) chrome.storage.local.set(defaults)
      }
    )
  }
  createContextMenus()
  ensureHibernateAlarm()
})
```

---

## Info

### IN-01: Unused `scripting` permission in manifest

**File:** `manifest.json:40`
**Issue:** `"scripting"` is listed in `permissions` but the codebase contains no call to `chrome.scripting.*`. The `scripting` permission grants the extension the ability to inject arbitrary JavaScript into pages — carrying it unnecessarily broadens the attack surface and may trigger additional scrutiny during Chrome Web Store review.

**Fix:** Remove `"scripting"` from the permissions array unless a planned feature requires it.

---

### IN-02: `Badge` component imported in `badge.tsx` but never used in the popup

**File:** `src/components/ui/badge.tsx`
**Issue:** The `Badge` component is scaffolded (generated by shadcn) but is not imported anywhere in the popup or elsewhere in the reviewed codebase. Dead code that ships in the extension bundle adds unnecessary weight.

**Fix:** Remove `src/components/ui/badge.tsx` unless a future phase plans to use it, or add it to a `.gitignore`-style exclusion list for the build.

---

### IN-03: Non-null assertion on `document.getElementById` in `main.tsx`

**File:** `src/popup/main.tsx:6`
**Issue:** `document.getElementById('root')!` uses a non-null assertion. If the `<div id="root">` element is ever absent from `index.html` (e.g. an accidental edit), the application will throw a runtime `TypeError: Cannot read properties of null (reading 'render')` with no useful error message.

**Fix:**
```typescript
const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('[smart-hibernator] Root element #root not found in popup HTML')
createRoot(rootEl).render(...)
```

---

### IN-04: Magic number `1` used as badge threshold in `badge.ts`

**File:** `src/background/badge.ts:2`
**Issue:** The condition `count >= 1000 ? '999+' : String(count)` uses `1000` and `'999+'` as magic literals. These are semantically meaningful display-cap values; naming them improves readability and makes future changes (e.g. raising the cap) a single-site edit.

**Fix:**
```typescript
const BADGE_MAX = 999
const text = count <= 0 ? '' : count > BADGE_MAX ? `${BADGE_MAX}+` : String(count)
```

---

_Reviewed: 2026-04-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
