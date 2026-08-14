// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSearchResults } from '../adapters/myucsc'
import { db } from '../storage/db'
import { createPlan } from '../storage/planStore'
import { installChromeStorageMock } from '../storage/testChromeMock'
import { useSettingsStore } from '../storage/useSettingsStore'
import { injectAddToPlanButtons, resolveAtomicGroup } from './scheduleInjection'

// Same synthetic-fixture convention as adapters/myucsc.test.ts: a linked
// lecture+discussion pair (CSE 101 01 / 01A) plus one standalone section.
const RESULTS_TABLE = `
<table>
  <tbody>
    <tr id="trSSR_CLSRSLT_WRK$0">
      <td><span id="CLASS_NBR$0">40325</span></td>
      <td><span id="CLASS_SUBJ_CATLG$0">CSE 101</span></td>
      <td><span id="CLASS_SECTION$0">01</span></td>
      <td><span id="MTG_DAYTIME$0">MWF 10:00AM-10:50AM</span></td>
      <td><span id="MTG_ROOM$0">Physical Sciences 110</span></td>
      <td><span id="MTG_INSTR$0">J. Smith</span></td>
      <td><span id="CLASS_SEATS$0">5 / 30</span></td>
      <td><span id="CLASS_LINKED$0" data-linked-keys="CSE 101 01A"></span></td>
    </tr>
    <tr id="trSSR_CLSRSLT_WRK$1">
      <td><span id="CLASS_NBR$1">40326</span></td>
      <td><span id="CLASS_SUBJ_CATLG$1">CSE 101</span></td>
      <td><span id="CLASS_SECTION$1">01A</span></td>
      <td><span id="MTG_DAYTIME$1">TTh 2:00PM-3:45PM</span></td>
      <td><span id="MTG_ROOM$1">Soc Sci 1 141</span></td>
      <td><span id="MTG_INSTR$1">Staff</span></td>
      <td><span id="CLASS_SEATS$1">3 / 25</span></td>
      <td><span id="CLASS_LINKED$1" data-linked-keys="CSE 101 01"></span></td>
    </tr>
    <tr id="trSSR_CLSRSLT_WRK$2">
      <td><span id="CLASS_NBR$2">41110</span></td>
      <td><span id="CLASS_SUBJ_CATLG$2">MATH 19A</span></td>
      <td><span id="CLASS_SECTION$2">01</span></td>
      <td><span id="MTG_DAYTIME$2">MWF 1:00PM-1:50PM</span></td>
      <td><span id="MTG_ROOM$2">Natural Sciences 2 101</span></td>
      <td><span id="MTG_INSTR$2">A. Nguyen</span></td>
      <td><span id="CLASS_SEATS$2">12 / 20</span></td>
    </tr>
  </tbody>
</table>`

async function activatePlan(): Promise<string> {
  const id = await createPlan('Test plan', 'fall-2026')
  useSettingsStore.getState().setSettings({ activePlanId: id })
  return id
}

beforeEach(() => installChromeStorageMock())

afterEach(async () => {
  await db.plans.clear()
  useSettingsStore.getState().setSettings({ activePlanId: null })
  document.body.innerHTML = ''
})

describe('resolveAtomicGroup', () => {
  it('returns just the section when it has no links', () => {
    const rows = [{ section: { courseCode: 'MATH 19A', sectionNumber: '01', meetingPattern: [], instructor: '', seatsOpen: 0 } }]
    expect(resolveAtomicGroup(rows[0]!.section, rows)).toEqual([rows[0]!.section])
  })

  it('resolves a linked section to itself plus its partner', () => {
    document.body.innerHTML = RESULTS_TABLE
    const rows = parseSearchResults(document)
    const [lecture, discussion] = rows.map((r) => r.section)
    expect(resolveAtomicGroup(lecture!, rows).map((s) => s.sectionNumber).sort()).toEqual(['01', '01A'])
    expect(resolveAtomicGroup(discussion!, rows)).toContainEqual(lecture)
  })
})

describe('injectAddToPlanButtons', () => {
  it('adds exactly one button per result row', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)
    expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('is idempotent — re-running does not double-inject', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)
    await injectAddToPlanButtons(document)
    expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('waits for asynchronously-loaded results before injecting', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const done = injectAddToPlanButtons(container)
    setTimeout(() => {
      container.innerHTML = RESULTS_TABLE
    }, 0)
    await done

    expect(container.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('re-injects buttons after MyUCSC replaces the results table (SPA re-search)', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)

    document.body.innerHTML = `
      <table><tbody><tr id="trSSR_CLSRSLT_WRK$0">
        <td><span id="CLASS_NBR$0">99999</span></td>
        <td><span id="CLASS_SUBJ_CATLG$0">PHYS 6</span></td>
        <td><span id="CLASS_SECTION$0">01</span></td>
        <td><span id="MTG_DAYTIME$0">TBA</span></td>
        <td><span id="MTG_ROOM$0">TBA</span></td>
        <td><span id="MTG_INSTR$0">Staff</span></td>
        <td><span id="CLASS_SEATS$0">1 / 1</span></td>
      </tr></tbody></table>`

    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(1)
    })
  })

  it('clicking with no active plan alerts and writes nothing', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)
    const alertSpy = vi.fn()
    window.alert = alertSpy

    const button = document.querySelector<HTMLButtonElement>('[data-slugpath-add]')
    button?.click()

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(await db.plans.toArray()).toHaveLength(0)
  })

  it('clicking a linked lecture adds both it and its discussion to the plan as one atomic write', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)
    const planId = await activatePlan()

    const lectureButton = document.querySelectorAll<HTMLButtonElement>('[data-slugpath-add]')[0]
    lectureButton?.click()

    await vi.waitFor(async () => {
      const plan = await db.plans.get(planId)
      expect(plan?.sections).toHaveLength(2)
    })
    const plan = await db.plans.get(planId)
    expect(plan?.sections.map((s) => `${s.courseCode} ${s.sectionNumber}`).sort()).toEqual(['CSE 101 01', 'CSE 101 01A'])
  })

  it('clicking a standalone section adds only that section', async () => {
    document.body.innerHTML = RESULTS_TABLE
    await injectAddToPlanButtons(document)
    const planId = await activatePlan()

    const standaloneButton = document.querySelectorAll<HTMLButtonElement>('[data-slugpath-add]')[2]
    standaloneButton?.click()

    await vi.waitFor(async () => {
      const plan = await db.plans.get(planId)
      expect(plan?.sections).toHaveLength(1)
    })
    const plan = await db.plans.get(planId)
    expect(plan?.sections[0]?.courseCode).toBe('MATH 19A')
  })
})
