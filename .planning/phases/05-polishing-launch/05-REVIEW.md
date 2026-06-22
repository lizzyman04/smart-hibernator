---
phase: 05-polishing-launch
reviewed: 2026-06-23T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - manifest.json
  - package.json
  - scripts/package.mjs
  - src/background/classifier.ts
  - src/background/idb.ts
  - src/content/form-watcher.ts
  - src/offscreen/main.ts
  - src/shared/constants.ts
  - src/shared/mem-probe.ts
  - src/shared/restricted-urls.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the Phase 5 launch-hardening surface: offscreen idle-teardown + pending
ref-count race guard (`classifier.ts`, `offscreen/main.ts`), the IDB quota guard
(`idb.ts`), the restricted-URL content-script guard (`form-watcher.ts`,
`restricted-urls.ts`), the DEV memory probe (`mem-probe.ts`), and the packaging
script (`scripts/package.mjs`).

Overall the new behavioral code is competently structured and well tested. The
`pending` ref-count guard (D-05), the quota guard (D-07), the restricted-URL
predicate (D-06), and the mem-probe guards (D-02) are all correct against their
stated contracts.

However, one BLOCKER-class correctness defect surfaces in `ensureOffscreen()`:
the concurrency guard promise (`creatingOffscreen`) is never reset on failure,
permanently wedging offscreen-document creation. Phase 5's idle-teardown feature
makes the recreate-on-demand path a routine occurrence, so this defect is far
more likely to be hit now than it was in Phase 3. Several WARNING-level
robustness gaps (unvalidated offscreen response shape, packaging zip that appends
to stale archives, version drift between manifest and package.json) follow.

## Critical Issues

### CR-01: `ensureOffscreen()` permanently wedges if `createDocument` ever rejects

**File:** `src/background/classifier.ts:158-171`
**Issue:**
The concurrency guard assigns the in-flight creation promise to the module-level
`creatingOffscreen`, awaits it, then resets it to `null`:

```ts
creatingOffscreen = chrome.offscreen.createDocument({ ... })
await creatingOffscreen   // line 169 — throws if createDocument rejects
creatingOffscreen = null  // line 170 — UNREACHABLE on rejection
```

If `createDocument()` rejects (transient Chrome failure, OS pressure, a stray
pre-existing offscreen doc causing "Only a single offscreen document may be
created"), `await creatingOffscreen` throws and line 170 never runs.
`creatingOffscreen` is left holding a **rejected** promise forever. Every later
`ensureOffscreen()` call hits the `if (creatingOffscreen) { await creatingOffscreen }`
branch (line 158-161) and re-throws the same stale rejection — so `classifyBatch`
silently no-ops for the rest of the service-worker lifetime and the AI classifier
is effectively dead until the SW is torn down.

Phase 5 directly amplifies this: the new idle-teardown closes the offscreen doc
after `OFFSCREEN_IDLE_MS`, so the recreate-on-demand path now runs on every burst
after an idle window — a path that in Phase 3 ran roughly once. A single transient
create failure now poisons the classifier indefinitely.

**Fix:** Reset the guard in a `finally` (and clear it on rejection so the next
caller retries cleanly):

```ts
// First caller: create the document
const creation = chrome.offscreen.createDocument({
  url: 'src/offscreen/index.html',
  reasons: [chrome.offscreen.Reason.WORKERS],
  justification: 'Run ONNX Runtime Web for local tab vitality classification',
})
creatingOffscreen = creation
try {
  await creation
} finally {
  // Always clear — a failed attempt must not poison subsequent calls
  if (creatingOffscreen === creation) creatingOffscreen = null
}
```

## Warnings

### WR-01: Offscreen `CLASSIFY_BATCH` response is consumed without shape validation

**File:** `src/background/classifier.ts:206-235`
**Issue:**
`classifyBatch` casts the `sendMessage` result to a typed shape and then iterates
`response.results` unconditionally:

```ts
response = (await chrome.runtime.sendMessage({ type: 'CLASSIFY_BATCH', ... })) as { results: [...] }
...
for (const r of response.results) { cache[r.tabId] = { ... } }  // line 233
```

If the offscreen handler's `.catch` path returns `{ results: [] }` this is fine,
but `chrome.runtime.sendMessage` can also resolve to `undefined` (no listener
responded, channel closed, doc torn down mid-flight despite the `pending` guard's
SW-side timer not having fired). In that case `response.results` is a TypeError
(`Cannot read properties of undefined`). It is caught by the outer `try/catch`
(line 238) so it does not crash, but it silently discards an entire batch and
masks a real wiring failure as a no-op. The cast (`as`) gives false confidence
that the shape is guaranteed.

**Fix:** Validate before iterating:

```ts
const results = Array.isArray(response?.results) ? response.results : []
if (results.length === 0) return
for (const r of results) { ... }
```

### WR-02: `package.mjs` runs `zip -r` into a possibly-existing archive — stale entries leak

**File:** `scripts/package.mjs:63-77`
**Issue:**
`zip -r "${outputZip}" .` **adds/updates** entries in an existing archive rather
than replacing it. If `smart-hibernator-<version>.zip` already exists from a prior
run (same version, e.g. re-running `npm run package` after a partial build, or a
hot-fix rebuild without a version bump), files deleted from `dist/` between runs
remain in the zip. The whole point of this script (Pitfall 6 guard) is to never
ship stale artifacts — yet the zip step itself can carry stale files forward. The
manifest guard only inspects the freshly-built `dist/manifest.json`, not the zip
contents, so a stale `manifest.json` cannot occur, but stale JS/asset files can.

**Fix:** Delete the target zip before creating it, or use `zip`'s freshen-from-scratch
behavior:

```ts
import { rmSync } from 'fs'
// ... before the zip step:
if (existsSync(outputZip)) rmSync(outputZip)
```

### WR-03: `manifest.json` version (1.0.1) and `package.json` version (1.0.0) have drifted

**File:** `package.json:3` (and `manifest.json:5`)
**Issue:**
`manifest.json` was bumped to `1.0.1` for the launch-hardening release (asserted
by `manifest.test.ts`), but `package.json` still reads `1.0.0`. The packaging
script names the zip from `dist/manifest.json`, so the shipped artifact is correct,
but the divergence is a release-hygiene hazard: tooling, CI, or a human reading
`package.json` will report the wrong version, and future bumps risk being applied
to only one file. Single-source-of-truth for version is the safer convention.

**Fix:** Bump `package.json` to `1.0.1` to match the manifest (or derive one from
the other in the build).

### WR-04: `getCssSelectorPath` can produce non-unique selectors → restore writes to the wrong field

**File:** `src/content/form-watcher.ts:113-124`, consumed at `:221` and `:257`
**Issue:**
The D-04 fallback builds an `nth-child` path only for elements lacking both `id`
and `name`. `nth-child(n)` counts among *all* sibling element types, and the path
stops at `document.body` without anchoring to a unique ancestor. Two structurally
similar subtrees (common in component-based pages / repeated form rows) can yield
the **same** selector path. On restore, `resolveField` (line 221) returns the
first match via `document.querySelector`, and `applyFieldValue` then writes the
saved value into a *different* field than the one captured. For a state-restoration
feature this is silent data corruption (wrong value injected), not just a missed
restore. `allFieldsResolved` (line 257) would still report success because *a*
match was found.

**Fix:** Prefer `:nth-of-type` over `:nth-child` for stability, and/or skip
capture when no `id`/`name` is available rather than risk a wrong-field write.
At minimum, document the known-limitation and bound it (e.g. only restore
selectorPath fields when exactly one element matches):

```ts
if (field.selectorPath) {
  const matches = document.querySelectorAll(field.selectorPath)
  return matches.length === 1 ? matches[0] : null  // ambiguous → skip
}
```

### WR-05: `package.mjs` swallows build/zip errors but ignores `execSync`'s thrown details

**File:** `scripts/package.mjs:27-32, 69-77`
**Issue:**
Both `catch (err)` blocks log a generic message and `process.exit(1)` without
surfacing `err`. `execSync` with `stdio: 'inherit'` does stream child output, so
the build's own errors are visible — but the zip failure path (line 74-77) prints
only "Ensure zip CLI is installed", masking other causes (permission denied on
the output path, disk full, a read-only `dist/`). The unused `err` binding is also
a lint smell. Surfacing the actual error shortens debugging.

**Fix:** Include the error: `console.error('[package] zip failed:', err?.message ?? err)`.

## Info

### IN-01: `pending` decrement and `armIdleTeardown` run before the cache write completes

**File:** `src/background/classifier.ts:212-237`
**Issue:**
`pending--` and `armIdleTeardown()` execute in the inner `finally` (line 213-214),
*before* the storage read / prune / write block (line 217-237). For the window of
that storage work `pending === 0`, so a previously-armed idle timer could in
principle fire and tear the doc down while the cache write is still running. With
`OFFSCREEN_IDLE_MS = 10 min` this is not reachable in practice (the write completes
in milliseconds), so it is informational, not a bug. Noted for intent clarity: the
`pending` guard protects the inference round-trip, not the subsequent cache write —
which is correct, since the cache write needs no offscreen doc.

**Fix:** None required; optionally add a one-line comment noting the cache write
deliberately runs outside the `pending` window.

### IN-02: `pruneIfNeeded` is the evictor for `tab-state` but only counts thumbnail bytes

**File:** `src/background/idb.ts:219-227` (evict cb) → `:134-148`
**Issue:**
`putTabState` passes `pruneIfNeeded` as the quota evictor, but `pruneIfNeeded`
sums and deletes only the `thumbnails` store (`getAllThumbnails`, `deleteThumbnail`).
If a `QuotaExceededError` is driven primarily by `tab-state` growth, eviction frees
thumbnail space and the retried `tab-state` write may still fail — at which point
the guard correctly gives up silently (D-07), so no crash. Acceptable as a
best-effort fallback, but the evictor is mismatched to the store it guards and the
comment ("size-bearing store") slightly oversells the protection.

**Fix:** Either evict from `tab-state` too, or note in the comment that thumbnail
eviction is the only lever and tab-state writes may simply be dropped under quota.

### IN-03: Restricted-prefix denylist is duplicated by hand in two files

**File:** `src/content/form-watcher.ts:9-19` vs `src/shared/restricted-urls.ts:5-15`
**Issue:**
`INLINED_RESTRICTED_PREFIXES` (content script) and `RESTRICTED_PREFIXES` (shared)
are maintained as two hand-kept copies. This is a deliberate project convention
(content scripts are import-free), and they currently match — but there is no test
asserting parity, so a future edit to one can silently desync the SW-side guard
from the content-script guard.

**Fix:** Add a small test importing both and asserting array equality, or generate
the inlined copy at build time. (`restricted-urls.test.ts` covers the shared list
only.)

### IN-04: `mem-probe.ts` uses repeated `as any` casts for guarded globals

**File:** `src/shared/mem-probe.ts:26-27, 37`
**Issue:**
`(globalThis as any).crossOriginIsolated` and
`(performance as any).measureUserAgentSpecificMemory` use `as any`, defeating type
checking on these accesses. Functionally fine and intentionally defensive (the API
is non-standard), but `as any` is broader than needed and could mask a typo in a
property name. A narrowed cast or a typed `declare` would be safer.

**Fix:** Narrow the cast, e.g.
`const fn = (performance as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number; breakdown: unknown }> }).measureUserAgentSpecificMemory`.

---

_Reviewed: 2026-06-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
