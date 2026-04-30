// tests/e2e/fixtures.ts
import { test as base, chromium, BrowserContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// __dirname is not available in ES module scope — derive it from import.meta.url
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pathToExtension = path.join(__dirname, '../../dist')

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,  // Chrome extensions require non-headless mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    // Wait for the service worker to register and extract the extension ID
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    const extensionId = sw.url().split('/')[2]
    await use(extensionId)
  },
})

export const expect = test.expect
