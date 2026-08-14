import type { Settings } from './types'

export const SETTINGS_STORAGE_KEY = 'settings'

export const DEFAULT_SETTINGS: Settings = {
  majorCode: null,
  catalogYear: null,
  calendarLinked: false,
  defaultTerm: null,
  activePlanId: null,
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_STORAGE_KEY)
  const stored = result[SETTINGS_STORAGE_KEY] as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
}
