// Thumbnail capture and WebP compression for Smart Hibernator
// Runs in Service Worker context — OffscreenCanvas available (Chrome 120+)
// RESEARCH.md Pattern 3 — OffscreenCanvas.convertToBlob (not canvas.toDataURL — DOM unavailable in SW)
import { putThumbnail, pruneIfNeeded } from './idb'
import { THUMBNAIL_MAX_SIZE_BYTES } from '../shared/constants'

/**
 * Compress a PNG data URL to WebP using OffscreenCanvas.
 * Returns null if OffscreenCanvas is unavailable (jsdom test environment or older Chrome).
 * Scales the image to at most 800×600 before encoding.
 * Retries at quality 0.4 if first pass exceeds THUMBNAIL_MAX_SIZE_BYTES (250 KB).
 */
export async function compressToWebP(pngDataUrl: string): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    const blob = await fetch(pngDataUrl).then((r) => r.blob())
    const img = await createImageBitmap(blob)

    const MAX_W = 800
    const MAX_H = 600
    const scale = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    const webpBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
    if (webpBlob.size > THUMBNAIL_MAX_SIZE_BYTES) {
      const smaller = await canvas.convertToBlob({ type: 'image/webp', quality: 0.4 })
      return blobToDataUrl(smaller)
    }
    return blobToDataUrl(webpBlob)
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Capture the visible tab screenshot, compress to WebP, and store in IndexedDB.
 * Silently no-ops if the tab was closed between onUpdated and capture.
 * Called from index.ts onUpdated listener — ONLY when tab.active === true (RESEARCH.md Pitfall 2).
 */
export async function captureAndStore(tabId: number, url: string, windowId: number): Promise<void> {
  try {
    const pngDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
    const dataUrl = await compressToWebP(pngDataUrl)
    if (dataUrl) {
      await putThumbnail({ tabId, url, dataUrl, capturedAt: Date.now() })
      await pruneIfNeeded()
    }
  } catch {
    // Tab closed between onUpdated and capture — silently continue
  }
}
