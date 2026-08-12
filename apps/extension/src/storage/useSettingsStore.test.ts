import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installChromeStorageMock } from './testChromeMock'
import { useSettingsStore } from './useSettingsStore'
import { getSettings } from './settingsStore'

beforeEach(() => installChromeStorageMock())

describe('useSettingsStore', () => {
  it('hydrates defaults when chrome.storage.local is empty', async () => {
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().settings.majorCode).toBeNull()
  })

  it('setSettings updates state and writes through to chrome.storage.local', async () => {
    await useSettingsStore.persist.rehydrate()
    useSettingsStore.getState().setSettings({ majorCode: 'CSE-BS' })

    expect(useSettingsStore.getState().settings.majorCode).toBe('CSE-BS')
    await vi.waitFor(async () => {
      expect((await getSettings()).majorCode).toBe('CSE-BS')
    })
  })
})
