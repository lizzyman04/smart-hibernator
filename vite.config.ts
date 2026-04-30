// Vite config for Smart Hibernator Chrome Extension (MV3)
// CRXJS 2.4.0 confirmed compatible with Vite 8.0.10
// See RESEARCH.md Pattern 2 for full rationale
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import manifest from './manifest.json'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: { assetsInlineLimit: 0 },
})
