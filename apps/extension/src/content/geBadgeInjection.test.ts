// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCatalogIndex, type CatalogSnapshot } from '@slugpath/catalog-snapshot'
import { db } from '../storage/db'
import { installChromeStorageMock } from '../storage/testChromeMock'
import { useSettingsStore } from '../storage/useSettingsStore'
import { injectGEBadges } from './geBadgeInjection'

const snapshot: CatalogSnapshot = {
  version: '2026-2027',
  generatedAt: '2026-01-01T00:00:00.000Z',
  courses: [
    { code: 'CSE 101', title: 'Software Engineering', units: 5, prereqRaw: '', geCodes: ['PR-E'], termsOffered: [] },
    { code: 'MATH 19A', title: 'Calculus For Science, Engineering', units: 5, prereqRaw: '', geCodes: ['MF'], termsOffered: [] },
    { code: 'THEA 80G', title: 'Acting for Non-Majors', units: 5, prereqRaw: '', geCodes: ['PR-E'], termsOffered: [] },
  ],
}

// loadCatalog does a real fetch + gzip decompress against a bundled asset --
// out of scope for a DOM/logic test, so stub it with an in-memory index built
// from the fixture snapshot above.
vi.mock('../prereq-graph/catalogSnapshot', () => ({
  loadCatalog: async () => ({ index: createCatalogIndex(snapshot), snapshot }),
}))

// Same pisa.ucsc.edu row shape as scheduleInjection.test.ts -- CSE 101 has
// two sections (lecture + discussion, same course code), MATH 19A has one.
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

beforeEach(() => installChromeStorageMock())

afterEach(async () => {
  await db.takenCourses.clear()
  await db.plans.clear()
  useSettingsStore.getState().setSettings({ activePlanId: null, majorCode: null })
  document.body.innerHTML = ''
})

describe('injectGEBadges', () => {
  it('renders one badge per GE code the course carries', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectGEBadges(document)

    const cse101Badges = document.querySelector('#rowpanel_0')!.querySelectorAll('[data-slugpath-ge-covered]')
    expect(cse101Badges).toHaveLength(1)
    expect(cse101Badges[0]!.textContent).toBe('PR-E')

    const mathBadges = document.querySelector('#rowpanel_1')!.querySelectorAll('[data-slugpath-ge-covered]')
    expect(mathBadges).toHaveLength(1)
    expect(mathBadges[0]!.textContent).toBe('MF')
  })

  it('marks a badge covered when a taken course already satisfies that GE, leaving others uncovered', async () => {
    await db.takenCourses.add({ courseCode: 'THEA 80G', term: 'fall-2026' })
    document.body.innerHTML = RESULTS_GRID
    await injectGEBadges(document)

    const cse101Badge = document.querySelector('#rowpanel_0')!.querySelector('[data-slugpath-ge-covered]')!
    expect(cse101Badge.getAttribute('data-slugpath-ge-covered')).toBe('true')

    const mathBadge = document.querySelector('#rowpanel_1')!.querySelector('[data-slugpath-ge-covered]')!
    expect(mathBadge.getAttribute('data-slugpath-ge-covered')).toBe('false')
  })

  it('is idempotent -- re-running does not double-inject badges', async () => {
    document.body.innerHTML = RESULTS_GRID
    await injectGEBadges(document)
    await injectGEBadges(document)

    expect(document.querySelectorAll('[data-slugpath-ge]')).toHaveLength(2)
  })
})
