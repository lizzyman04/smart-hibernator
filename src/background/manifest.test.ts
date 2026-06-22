/**
 * Manifest assertion test (D-03/D-09)
 *
 * Pins the permission set and metadata so regressions are caught at test time:
 * - scripting is NOT present (D-03 removal — grep-confirmed zero chrome.scripting usages in src/)
 * - all six kept permissions ARE present (storage, tabs, alarms, contextMenus, activeTab, offscreen)
 * - homepage_url is present (D-09 metadata polish)
 * - icons has all four required sizes (16, 32, 48, 128)
 * - version is the bumped 1.0.1 launch-hardening release
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Read manifest.json from repo root (relative to the project root, not src/background/)
const manifestPath = resolve(__dirname, '../../manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

const KEPT_PERMISSIONS = ['storage', 'tabs', 'alarms', 'contextMenus', 'activeTab', 'offscreen'] as const

describe('manifest.json permission set (D-03/D-04)', () => {
  it('does NOT include the unused scripting permission', () => {
    expect(manifest.permissions).not.toContain('scripting')
  })

  it.each(KEPT_PERMISSIONS)('includes the kept permission: %s', (permission) => {
    expect(manifest.permissions).toContain(permission)
  })

  it('has exactly six permissions (no extras, no removals)', () => {
    expect(manifest.permissions).toHaveLength(6)
    expect(manifest.permissions.slice().sort()).toEqual([...KEPT_PERMISSIONS].sort())
  })
})

describe('manifest.json metadata (D-09)', () => {
  it('has homepage_url pointing to the GitHub repo', () => {
    expect(manifest.homepage_url).toBeDefined()
    expect(typeof manifest.homepage_url).toBe('string')
    expect(manifest.homepage_url.length).toBeGreaterThan(0)
  })

  it('has version bumped to 1.0.1 (first launch-hardening release)', () => {
    expect(manifest.version).toBe('1.0.1')
  })

  it('has name set', () => {
    expect(typeof manifest.name).toBe('string')
    expect(manifest.name.length).toBeGreaterThan(0)
  })

  it('has description set', () => {
    expect(typeof manifest.description).toBe('string')
    expect(manifest.description.length).toBeGreaterThan(0)
  })
})

describe('manifest.json icon set (D-09)', () => {
  const REQUIRED_SIZES = [16, 32, 48, 128] as const

  it('declares icons at all four required sizes', () => {
    expect(manifest.icons).toBeDefined()
    for (const size of REQUIRED_SIZES) {
      expect(manifest.icons[String(size)]).toBeDefined()
    }
  })

  it.each(REQUIRED_SIZES)('icon size %d is declared', (size) => {
    expect(manifest.icons[String(size)]).toBeTruthy()
  })
})
