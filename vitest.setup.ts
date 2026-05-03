// vitest-chrome@0.1.0 does not declare an exports field, causing Node to load
// the CJS entry which requires() vitest — incompatible with vitest 4.x ESM.
// Use the ESM bundle directly to bypass the CJS loader.
// The ESM bundle exports { chrome } as a named export — destructure to get the
// actual mock object (the namespace object itself has no .tabs/.storage properties).
import { chrome } from 'vitest-chrome/lib/index.esm.js'
import { vi } from 'vitest'

// vitest-chrome covers MV2 APIs only — chrome.action is MV3 and not included.
// Add a vi.fn() stub for each chrome.action method used by badge.ts so tests
// calling updateBadge() do not throw "Cannot read properties of undefined".
const chromeMV3Action = {
  setBadgeText: vi.fn().mockResolvedValue(undefined),
  setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
  setBadgeTextColor: vi.fn().mockResolvedValue(undefined),
  setIcon: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
  setPopup: vi.fn().mockResolvedValue(undefined),
}

Object.assign(global, { chrome: { ...chrome, action: chromeMV3Action } })

// ResizeObserver is not implemented in jsdom — required by Recharts ResponsiveContainer
// Polyfill with a no-op stub so dashboard App.test.tsx can render without throwing
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverStub,
})

// fake-indexeddb/auto installs global indexedDB, IDBKeyRange, etc. in jsdom scope
// Required for src/background/idb.test.ts (FR-08)
import 'fake-indexeddb/auto'
