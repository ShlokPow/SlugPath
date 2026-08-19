// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../storage/db'
import { createPlan } from '../storage/planStore'
import { installChromeStorageMock } from '../storage/testChromeMock'
import { useSettingsStore } from '../storage/useSettingsStore'
import { injectAddToPlanButtons, resolveAtomicGroup } from './scheduleInjection'

// Same pisa.ucsc.edu row shape as adapters/myucsc.test.ts (see that file for
// the verbatim-capture note) -- three standalone sections. The real site
// has no verified cross-listed/linked-section markup yet (see the ponytail
// note in myucsc.ts), so this fixture doesn't model one; resolveAtomicGroup
// itself is still covered directly with manually-constructed Sections below.
const RESULTS_GRID = `
<div class="panel panel-default row" id="rowpanel_0">
  <div class="panel-heading panel-heading-custom"><h2><a id="class_id_40325" href="#">CSE 101 - 01&nbsp;&nbsp;&nbsp;Software Engineering</a></h2></div>
  <div class="panel-body">
    <div class="row">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_40325" href="#">40325</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user"></i><i class="sr-only">Instructor:</i> J. Smith</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow"></i><i class="sr-only">Location:</i> LEC: Physical Sciences 110</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o"></i><i class="sr-only">Day and Time:</i> MWF 10:00AM-10:50AM</div>
      </div>
      <div class="col-xs-6 col-sm-3"> 25 of 30 Enrolled</div>
    </div>
  </div>
</div>
<div class="panel panel-default row" id="rowpanel_1">
  <div class="panel-heading panel-heading-custom"><h2><a id="class_id_40326" href="#">CSE 101 - 01A&nbsp;&nbsp;&nbsp;Software Engineering</a></h2></div>
  <div class="panel-body">
    <div class="row">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_40326" href="#">40326</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user"></i><i class="sr-only">Instructor:</i> Staff</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow"></i><i class="sr-only">Location:</i> DIS: Soc Sci 1 141</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o"></i><i class="sr-only">Day and Time:</i> TTh 2:00PM-3:45PM</div>
      </div>
      <div class="col-xs-6 col-sm-3"> 22 of 25 Enrolled</div>
    </div>
  </div>
</div>
<div class="panel panel-default row" id="rowpanel_2">
  <div class="panel-heading panel-heading-custom"><h2><a id="class_id_41110" href="#">MATH 19A - 01&nbsp;&nbsp;&nbsp;Calculus For Science, Engineering</a></h2></div>
  <div class="panel-body">
    <div class="row">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_41110" href="#">41110</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user"></i><i class="sr-only">Instructor:</i> A. Nguyen</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow"></i><i class="sr-only">Location:</i> LEC: Natural Sciences 2 101</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o"></i><i class="sr-only">Day and Time:</i> MWF 1:00PM-1:50PM</div>
      </div>
      <div class="col-xs-6 col-sm-3"> 8 of 20 Enrolled</div>
    </div>
  </div>
</div>`

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
    const lecture = {
      courseCode: 'CSE 101',
      sectionNumber: '01',
      meetingPattern: [],
      instructor: '',
      seatsOpen: 0,
      linkedSectionKeys: ['CSE 101 01A'],
    }
    const discussion = {
      courseCode: 'CSE 101',
      sectionNumber: '01A',
      meetingPattern: [],
      instructor: '',
      seatsOpen: 0,
      linkedSectionKeys: ['CSE 101 01'],
    }
    const rows = [{ section: lecture }, { section: discussion }]
    expect(resolveAtomicGroup(lecture, rows).map((s) => s.sectionNumber).sort()).toEqual(['01', '01A'])
    expect(resolveAtomicGroup(discussion, rows)).toContainEqual(lecture)
  })
})

describe('injectAddToPlanButtons', () => {
  it('adds exactly one button per result row', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectAddToPlanButtons(document)
    expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('is idempotent — re-running does not double-inject', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectAddToPlanButtons(document)
    await injectAddToPlanButtons(document)
    expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('waits for asynchronously-loaded results before injecting', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const done = injectAddToPlanButtons(container)
    setTimeout(() => {
      container.innerHTML = RESULTS_GRID
    }, 0)
    await done

    expect(container.querySelectorAll('[data-slugpath-add]')).toHaveLength(3)
  })

  it('re-injects buttons after MyUCSC replaces the results grid (SPA re-search)', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectAddToPlanButtons(document)

    document.body.innerHTML = `
      <div class="panel panel-default row" id="rowpanel_0">
        <div class="panel-heading panel-heading-custom"><h2><a id="class_id_99999" href="#">PHYS 6 - 01&nbsp;&nbsp;&nbsp;Intro Physics</a></h2></div>
        <div class="panel-body">
          <div class="row">
            <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_99999" href="#">99999</a></div>
            <div class="col-xs-6 col-sm-3"><i class="fa fa-user"></i><i class="sr-only">Instructor:</i> Staff</div>
            <div class="col-xs-12 col-sm-6">
              <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow"></i><i class="sr-only">Location:</i> Asynchronous Online</div>
              <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o"></i><i class="sr-only">Day and Time:</i> Asynchronous Online</div>
            </div>
            <div class="col-xs-6 col-sm-3"> 1 of 1 Enrolled</div>
          </div>
        </div>
      </div>`

    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-slugpath-add]')).toHaveLength(1)
    })
  })

  it('clicking with no active plan alerts and writes nothing', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectAddToPlanButtons(document)
    const alertSpy = vi.fn()
    window.alert = alertSpy

    const button = document.querySelector<HTMLButtonElement>('[data-slugpath-add]')
    button?.click()

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(await db.plans.toArray()).toHaveLength(0)
  })

  it('clicking a section adds only that section', async () => {
    document.body.innerHTML = RESULTS_GRID
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
