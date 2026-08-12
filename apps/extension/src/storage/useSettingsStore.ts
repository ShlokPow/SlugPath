import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, getSettings, setSettings } from './settingsStore'
import type { Settings } from './types'

interface SettingsState {
  settings: Settings
  setSettings: (patch: Partial<Settings>) => void
}

type PersistedSettings = Pick<SettingsState, 'settings'>

// Delegates straight to settingsStore's chrome.storage.local calls instead of
// re-implementing get/set — zustand's `name` option is unused since the
// underlying storage key is owned by settingsStore.ts.
const chromeSettingsStorage: PersistStorage<PersistedSettings> = {
  getItem: async (): Promise<StorageValue<PersistedSettings> | null> => {
    const settings = await getSettings()
    return { state: { settings }, version: 0 }
  },
  setItem: async (_name, value) => {
    await setSettings(value.state.settings)
  },
  removeItem: async () => {
    await setSettings(DEFAULT_SETTINGS)
  },
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: chromeSettingsStorage,
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
)

// persist only reads storage once on init; without this, a settings change made
// in one context (e.g. options page) would never reach an already-open content
// script or popup, since chrome.storage.local doesn't push updates into JS state.
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && SETTINGS_STORAGE_KEY in changes) {
      void useSettingsStore.persist.rehydrate()
    }
  })
}
