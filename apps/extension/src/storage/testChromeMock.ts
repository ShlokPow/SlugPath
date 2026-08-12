import { vi } from 'vitest'

/** Minimal in-memory chrome.storage.local + onChanged mock shared by storage tests. */
export function installChromeStorageMock() {
  const store: Record<string, unknown> = {}
  const listeners: Array<(changes: Record<string, unknown>, areaName: string) => void> = []

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, newValue] of Object.entries(items)) {
            const oldValue = store[key]
            store[key] = newValue
            for (const listener of listeners) listener({ [key]: { oldValue, newValue } }, 'local')
          }
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key]
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: (changes: Record<string, unknown>, areaName: string) => void) => {
          listeners.push(listener)
        }),
      },
    },
  })

  return store
}
