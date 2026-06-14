// tests/e2e/phase04-restore.spec.ts
// Phase 4 (Perfect State Restoration) browser verification — FR-11 / FR-12.
// Drives a real Chrome with the unpacked extension, captures scroll + form
// state on a live http page, simulates wake via reload (same tabId + url),
// and asserts: scroll restored, text field restored, password field stays
// blank (D-03 exclusion), and the IDB tab-state entry is deleted after restore.
import { test as base, expect, chromium, type BrowserContext } from '@playwright/test'
import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pathToExtension = path.join(__dirname, '../../dist')

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>p4</title></head>
<body style="margin:0">
  <div style="height:600px">top spacer</div>
  <input id="username" name="username" type="text" autocomplete="off">
  <input id="pw" name="pw" type="password" autocomplete="off">
  <div style="height:3000px">bottom spacer</div>
</body></html>`

// Self-contained fixture: system Chrome (channel 'chrome') + a local http server.
const test = base.extend<{
  context: BrowserContext
  baseURL: string
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    })
    await use(context)
    await context.close()
  },
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(PAGE_HTML)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    await use(`http://127.0.0.1:${port}/`)
    await new Promise<void>((resolve) => server.close(() => resolve()))
  },
})

// Read tab-state object-store keys from the extension Service Worker context.
async function tabStateKeys(context: BrowserContext): Promise<number> {
  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker')
  return sw.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open('smart-hibernator')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const keys: IDBValidKey[] = await new Promise((resolve, reject) => {
      const tx = db.transaction('tab-state', 'readonly')
      const rq = tx.objectStore('tab-state').getAllKeys()
      rq.onsuccess = () => resolve(rq.result)
      rq.onerror = () => reject(rq.error)
    })
    db.close()
    return keys.length
  })
}

test('FR-11/FR-12: scroll + form restore on wake, password excluded, IDB evicted', async ({
  context,
  baseURL,
}) => {
  const page = await context.newPage()
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

  // Let the content script (document_idle, <all_urls>) inject.
  await page.waitForTimeout(500)

  // Capture-worthy interaction: scroll + fill text + fill password.
  await page.evaluate(() => window.scrollTo(0, 500))
  await page.fill('#username', 'hello world')
  await page.fill('#pw', 'secret-should-not-persist')

  // Debounce is 500ms; wait past it so SAVE_STATE reaches the SW + IDB.
  await page.waitForTimeout(900)

  // Snapshot must now exist in IDB.
  await expect.poll(() => tabStateKeys(context), { timeout: 5000 }).toBeGreaterThan(0)

  // Simulate wake: reload keeps the same tabId + url -> content script GET_STATE.
  await page.reload({ waitUntil: 'domcontentloaded' })

  // Restore is async (GET_STATE round-trip + rAF + MutationObserver). Poll.
  await expect.poll(async () => page.inputValue('#username'), { timeout: 5000 }).toBe(
    'hello world',
  )

  // Password field must be blank — D-03 exclusion (never captured).
  expect(await page.inputValue('#pw')).toBe('')

  // Scroll restored (rAF). Allow small tolerance.
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(Math.abs(scrollY - 500)).toBeLessThan(20)

  // Delete-after-restore: IDB tab-state entry evicted once consumed.
  await expect.poll(() => tabStateKeys(context), { timeout: 5000 }).toBe(0)

  await page.close()
})

export { test }
