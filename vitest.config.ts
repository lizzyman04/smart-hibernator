import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Exclude Playwright E2E specs — they use @playwright/test's test() which
    // is incompatible with vitest's runner and must only be run via `playwright test`
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
})
