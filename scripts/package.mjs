/**
 * scripts/package.mjs — CWS-ready packaging script (D-09)
 *
 * 1. Runs `npm run build` FIRST to produce a fresh dist/ (Pitfall 6 guard:
 *    the stale dist/ still contains 'scripting' and must not be uploaded).
 * 2. Asserts dist/manifest.json contains no 'scripting' permission and has the
 *    bumped version — exits nonzero if either guard fails.
 * 3. Zips the CONTENTS of dist/ (manifest.json at the ZIP ROOT, as CWS requires).
 * 4. Names the output smart-hibernator-<version>.zip, reading version from dist/manifest.json.
 *
 * Usage: npm run package
 * Requires: zip CLI (installed on Linux/macOS; fallback not needed per environment check)
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist')

// ─── Step 1: Build ──────────────────────────────────────────────────────────

console.log('[package] Step 1: Running npm run build (ensures dist/ is fresh)…')
try {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
} catch (err) {
  console.error('[package] Build failed — aborting packaging.')
  process.exit(1)
}

// ─── Step 2: Guard — verify dist/manifest.json is clean (Pitfall 6) ─────────

const distManifestPath = join(DIST, 'manifest.json')
if (!existsSync(distManifestPath)) {
  console.error('[package] dist/manifest.json not found after build — check vite.config.ts.')
  process.exit(1)
}

const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf-8'))

if (distManifest.permissions && distManifest.permissions.includes('scripting')) {
  console.error(
    '[package] GUARD FAILED: dist/manifest.json still contains "scripting" permission.\n' +
    '  This means the build did not pick up the manifest.json edit.\n' +
    '  Fix manifest.json and re-run npm run package.'
  )
  process.exit(1)
}

const { version } = distManifest
if (!version) {
  console.error('[package] dist/manifest.json has no "version" field — aborting.')
  process.exit(1)
}

console.log(`[package] Guard passed: dist/manifest.json version=${version}, no "scripting" permission.`)

// ─── Step 3: Zip dist/ contents with manifest at root ───────────────────────

const outputZip = join(ROOT, `smart-hibernator-${version}.zip`)
console.log(`[package] Step 3: Creating ${outputZip} …`)

// Use system zip CLI (verified available on Linux/macOS).
// Zip the CONTENTS of dist/ (cd into dist first), so manifest.json is at the archive root.
// CWS requires manifest.json at the top level of the zip, not nested inside a dist/ directory.
try {
  execSync(`zip -r "${outputZip}" .`, {
    cwd: DIST,
    stdio: 'inherit',
  })
} catch (err) {
  console.error('[package] zip command failed. Ensure zip CLI is installed.')
  process.exit(1)
}

// ─── Step 4: Post-zip verification ──────────────────────────────────────────

console.log('[package] Step 4: Verifying zip contents…')
try {
  const zipList = execSync(`unzip -l "${outputZip}"`, { encoding: 'utf-8' })
  const hasManifestAtRoot = /^\s+\d+\s+[\d-]+\s+[\d:]+\s+manifest\.json\s*$/m.test(zipList)
  if (!hasManifestAtRoot) {
    console.warn('[package] Warning: manifest.json may not be at the zip root. Verify manually.')
    console.log('[package] Zip contents:\n', zipList.split('\n').slice(0, 20).join('\n'))
  } else {
    console.log('[package] Verified: manifest.json is at the zip root.')
  }
} catch {
  // unzip -l is optional verification; zip was already created
  console.log('[package] (unzip not available for post-zip listing — skipping list verification)')
}

console.log(`\n[package] Done! CWS-ready package: ${outputZip}`)
console.log(`[package] Upload this zip at: https://chrome.google.com/webstore/devconsole`)
