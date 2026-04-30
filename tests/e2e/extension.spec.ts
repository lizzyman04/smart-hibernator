// tests/e2e/extension.spec.ts
import { test, expect } from './fixtures'

test.describe('Smart Hibernator MV3 Extension', () => {
  test('extension service worker registers successfully (COMP-01, NFR-06)', async ({
    context,
    extensionId,
  }) => {
    // Service worker URL must be chrome-extension://
    const serviceWorkers = context.serviceWorkers()
    expect(serviceWorkers.length).toBeGreaterThan(0)

    const swUrl = serviceWorkers[0].url()
    expect(swUrl).toMatch(/^chrome-extension:\/\//)
    expect(extensionId).toMatch(/^[a-z]{32}$/)  // Chrome extension IDs are 32 lowercase chars
  })

  test('extension popup page opens without errors (FR-04)', async ({
    context,
    extensionId,
  }) => {
    // Open the popup as a regular page (headless-compatible approach)
    const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html`
    const page = await context.newPage()
    await page.goto(popupUrl, { waitUntil: 'domcontentloaded' })

    // Verify popup rendered — the React root should contain our brand text
    await expect(page.locator('text=Smart Hibernator')).toBeVisible({ timeout: 5000 })
    await page.close()
  })

  test('extension storage initializes with correct defaults on install (FR-01, FR-02)', async ({
    context,
    extensionId,
  }) => {
    // Evaluate storage state via a new page in the extension's context.
    // Poll until hibernation_enabled is set — onInstalled fires async after SW starts,
    // so we must wait rather than read immediately after domcontentloaded.
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`, {
      waitUntil: 'domcontentloaded',
    })

    // Wait up to 5 seconds for onInstalled to complete storage initialization
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          chrome.storage.local.get('hibernation_enabled', (result) => {
            resolve(result['hibernation_enabled'] !== undefined)
          })
        }),
      { timeout: 5000 }
    )

    const storageState = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(
          ['hibernation_enabled', 'hibernated_count', 'protected_tabs', 'protected_domains'],
          resolve
        )
      })
    })

    expect(storageState['hibernation_enabled']).toBe(true)
    expect(storageState['hibernated_count']).toBe(0)
    expect(storageState['protected_tabs']).toEqual([])
    expect(storageState['protected_domains']).toEqual([])

    await page.close()
  })
})
