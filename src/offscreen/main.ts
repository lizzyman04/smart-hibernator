// Offscreen Document — ORT-Web session manager + CLASSIFY_BATCH handler
// Runs in a hidden HTML page (offscreen document) to access WebGPU/WASM.
// Per RESEARCH.md: ORT-Web cannot run in the MV3 Service Worker.
// Follows idb.ts module-level singleton pattern for session init (PATTERNS.md).
// Top-level listener registered synchronously per PATTERNS.md Top-Level rule.
import * as ort from 'onnxruntime-web/wasm'
import type { TabVitality } from '../shared/types'

// ─── Module-level session singleton (never inside listeners) ───────────────
// Replicate idb.ts dbPromise pattern exactly.

let session: ort.InferenceSession | null = null
let sessionInit: Promise<void> | null = null

/**
 * Lazily initialise the ORT InferenceSession (once, reused for all requests).
 * Configures WASM paths and numThreads BEFORE session creation (Pitfall 1).
 * Probes navigator.gpu to select WebGPU or WASM execution provider (NFR-03).
 */
async function getSession(): Promise<ort.InferenceSession> {
  if (session) return session

  if (!sessionInit) {
    sessionInit = (async () => {
      // Set WASM paths BEFORE InferenceSession.create — Pitfall 1
      ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/')
      // numThreads=1: WASM threads require SharedArrayBuffer/cross-origin isolation
      // which complicates extension CSP — single thread is fast enough for a tiny model
      ort.env.wasm.numThreads = 1

      const modelUrl = chrome.runtime.getURL('src/assets/classifier.onnx')
      const modelBuffer = await fetch(modelUrl).then((r) => r.arrayBuffer())

      // WebGPU primary, WASM fallback per NFR-03
      const webgpuAvailable = typeof navigator !== 'undefined' && !!(navigator as any).gpu
      const eps = webgpuAvailable ? ['webgpu', 'wasm'] : ['wasm']

      session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: eps,
      })
    })()
    await sessionInit
    sessionInit = null
  } else {
    await sessionInit
  }

  return session!
}

// ─── CLASSIFY_BATCH handler ─────────────────────────────────────────────────

/**
 * Label order MUST match the skl2onnx training label order used in
 * scripts/generate-model.py: 0=Dead, 1=Semi-Active, 2=Vital.
 */
const LABEL_ORDER: TabVitality[] = ['Dead', 'Semi-Active', 'Vital']

/**
 * Run ONNX inference for a batch of tabs and return per-tab label + confidence.
 * Validates feature vector length (T-03-08).
 * Wraps each inference in try/catch so one bad input doesn't poison the batch.
 */
async function handleClassifyBatch(
  tabs: Array<{ tabId: number; features: number[] }>
): Promise<{ results: Array<{ tabId: number; label: TabVitality | null; confidence: number }> }> {
  const sess = await getSession()

  const results = await Promise.all(
    tabs.map(async ({ tabId, features }) => {
      // T-03-08: validate feature array before running session
      if (!Array.isArray(features) || features.length !== 6) {
        return { tabId, label: null as TabVitality | null, confidence: 0 }
      }

      try {
        const tensor = new ort.Tensor('float32', new Float32Array(features), [1, 6])
        const output = await sess.run({ float_input: tensor })

        // Extract probability tensor — prefer output_probability; fall back to
        // first tensor with dims [1, 3] (Decision Tree output shape)
        let probTensor = output['output_probability']
        if (!probTensor) {
          const fallbackKey = Object.keys(output).find((k) => {
            const t = output[k]
            return t.dims && t.dims[0] === 1 && t.dims[1] === 3
          })
          if (fallbackKey) probTensor = output[fallbackKey]
        }

        if (!probTensor) {
          return { tabId, label: null as TabVitality | null, confidence: 0 }
        }

        const probs = probTensor.data as Float32Array
        const maxVal = Math.max(...Array.from(probs))
        const maxIdx = Array.from(probs).indexOf(maxVal)
        const confidence = maxVal
        const label = LABEL_ORDER[maxIdx] ?? null

        return { tabId, label: label as TabVitality | null, confidence }
      } catch {
        return { tabId, label: null as TabVitality | null, confidence: 0 }
      }
    })
  )

  return { results }
}

// ─── Top-level synchronous listener registration ────────────────────────────
// CRITICAL: must be at module top level, not inside async callbacks.
// return true keeps the message channel open for the async response.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'CLASSIFY_BATCH') {
    handleClassifyBatch(
      message.tabs as Array<{ tabId: number; features: number[] }>
    )
      .then(sendResponse)
      .catch(() => sendResponse({ results: [] }))
    return true // keep channel open for async response
  }
})

// ─── DOMContentLoaded warm-up ───────────────────────────────────────────────
// Pre-warm the session on document load to avoid cold-start delay on the first
// alarm tick. Guarded by typeof document check so this file can be imported
// under vitest jsdom without throwing.

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    getSession().catch((err) =>
      console.error('[smart-hibernator/offscreen] session init failed', err)
    )
  })
}
