import { beforeEach, describe, expect, it } from 'vitest'
import { installChromeStorageMock } from './testChromeMock'
import { DEFAULT_SETTINGS, getSettings, setSettings } from './settingsStore'

beforeEach(() => installChromeStorageMock())

describe('settingsStore', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists settings and reads them back', async () => {
    await setSettings({
      majorCode: 'CSE-BS',
      catalogYear: '2025-2026',
      calendarLinked: true,
      defaultTerm: 'fall-2025',
      activePlanId: 'plan-1',
      geAssignments: { 'CRES 10': 'ER' },
      degreeProgressGECodes: ['CC', 'MF'],
      degreeProgressImportedAt: 1755600000000,
    })

    expect(await getSettings()).toEqual({
      majorCode: 'CSE-BS',
      catalogYear: '2025-2026',
      calendarLinked: true,
      defaultTerm: 'fall-2025',
      activePlanId: 'plan-1',
      geAssignments: { 'CRES 10': 'ER' },
      degreeProgressGECodes: ['CC', 'MF'],
      degreeProgressImportedAt: 1755600000000,
    })
  })
})
