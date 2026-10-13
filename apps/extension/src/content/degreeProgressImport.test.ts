// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../storage/db'
import { installChromeStorageMock } from '../storage/testChromeMock'
import { useSettingsStore } from '../storage/useSettingsStore'
import { injectDegreeProgressImport } from './degreeProgressImport'

// Trimmed real capture (see adapters/degreeProgress.test.ts for the full
// verbatim version and provenance) -- header + one satisfied category (GE
// CC, collapsed, no course table) + the DC divider, enough to exercise the
// button's own DOM-scoping and the import write path.
const DPR_FIXTURE = `
<table cellpadding="2" cellspacing="0" cols="1" class="PSGROUPBOXWBO" width="923">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left"><div id="win0divDERIVED_SAA_DPR_GROUPBOX1GP$1">&nbsp;<img src="x.svg" alt="requirement satisfied">&nbsp;GENERAL EDUCATION REQUIREMENTS *excluding DC&nbsp;</div></td></tr>
<tr><td>
<div id="win0divDERIVED_SAA_DPR_GROUPBOX3$3"><table cellpadding="2" cellspacing="0" cols="1" width="828">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left"><div id="win0divDERIVED_SAA_DPR_GROUPBOX3GP$3">&nbsp;<img src="x.svg" alt="requirement satisfied">&nbsp;GE CC: Cross-Cultural Analysis&nbsp;</div></td></tr>
</tbody></table>
</div>
<div id="win0divDERIVED_SAA_DPR_GROUPBOX2$13"><table cellpadding="0" cellspacing="0" cols="1" width="630">
<tbody><tr><td class="PAGROUPDIVIDER" align="left">GE DC: Disciplinary Communication</td></tr>
</tbody></table>
</div>
</td></tr>
</tbody></table>
`

beforeEach(() => installChromeStorageMock())

afterEach(async () => {
  await db.takenCourses.clear()
  useSettingsStore.getState().setSettings({ degreeProgressGECodes: null, degreeProgressImportedAt: null })
  document.body.innerHTML = ''
})

describe('injectDegreeProgressImport', () => {
  it('adds exactly one button, on the GENERAL EDUCATION REQUIREMENTS header', () => {
    document.body.innerHTML = DPR_FIXTURE
    injectDegreeProgressImport(document)
    const buttons = document.querySelectorAll('[data-slugpath-dpr-import]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.closest('td.PSGROUPBOXLABEL')?.textContent).toContain('GENERAL EDUCATION REQUIREMENTS')
  })

  it('is idempotent — re-running does not double-inject', () => {
    document.body.innerHTML = DPR_FIXTURE
    injectDegreeProgressImport(document)
    injectDegreeProgressImport(document)
    expect(document.querySelectorAll('[data-slugpath-dpr-import]')).toHaveLength(1)
  })

  it('clicking writes the satisfied GE codes to settings, skipping DC', async () => {
    document.body.innerHTML = DPR_FIXTURE
    injectDegreeProgressImport(document)
    const button = document.querySelector<HTMLButtonElement>('[data-slugpath-dpr-import]')
    button?.click()
    await new Promise((resolve) => setTimeout(resolve, 0)) // flush the async click handler

    expect(useSettingsStore.getState().settings.degreeProgressGECodes).toEqual(['CC'])
    expect(useSettingsStore.getState().settings.degreeProgressImportedAt).toEqual(expect.any(Number))
  })

  it('clicking updates the button label with the imported count', async () => {
    document.body.innerHTML = DPR_FIXTURE
    injectDegreeProgressImport(document)
    const button = document.querySelector<HTMLButtonElement>('[data-slugpath-dpr-import]')
    button?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(button?.textContent).toBe('Imported 1 satisfied GEs')
  })
})
