import { describe, expect, it } from 'vitest'
import { createCatalogIndex, type CatalogSnapshot, type GERequirement } from '@slugpath/catalog-snapshot'
import { applyGEAssignment, computeGEProgress, computeGESlots, findMultiGECourses } from './geProgress'

const snapshot: CatalogSnapshot = {
  version: '2026-2027',
  generatedAt: '2026-01-01T00:00:00.000Z',
  courses: [
    { code: 'CRES 10', title: 'Intro to Critical Race Studies', units: 5, prereqRaw: '', geCodes: ['CC', 'ER'], termsOffered: [] },
    { code: 'AM 3', title: 'Calculus III', units: 5, prereqRaw: '', geCodes: ['MF'], termsOffered: [] },
    { code: 'THEA 80G', title: 'Acting for Non-Majors', units: 5, prereqRaw: '', geCodes: ['PE-T'], termsOffered: [] },
  ],
}
const catalog = createCatalogIndex(snapshot)

const requirements: GERequirement[] = [
  { code: 'CC', name: 'Cross-Cultural Analysis', description: '' },
  { code: 'ER', name: 'Ethnicity and Race', description: '' },
  { code: 'MF', name: 'Mathematical and Formal Reasoning', description: '' },
  { code: 'DC', name: 'Disciplinary Communication', description: '' },
  { code: 'PE-E', name: 'Perspectives: Environmental Awareness', description: '', group: 'PE' },
  { code: 'PE-T', name: 'Perspectives: Technology and Society', description: '', group: 'PE' },
]

describe('computeGEProgress', () => {
  it('marks a requirement satisfied when a taken course carries its code', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    const cc = progress.find((p) => p.code === 'CC')
    expect(cc?.satisfied).toBe(true)
    expect(cc?.creditedBy).toEqual([{ courseCode: 'CRES 10', status: 'taken' }])
  })

  it('marks a requirement satisfied by a planned (not yet taken) course', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: [], plannedCourseCodes: ['AM 3'], majorCode: null },
      requirements,
    )
    expect(progress.find((p) => p.code === 'MF')?.creditedBy).toEqual([{ courseCode: 'AM 3', status: 'planned' }])
  })

  it('leaves an uncovered requirement unsatisfied with no credits', () => {
    const progress = computeGEProgress({ catalog, takenCourseCodes: [], plannedCourseCodes: [], majorCode: null }, requirements)
    const er = progress.find((p) => p.code === 'ER')
    expect(er?.satisfied).toBe(false)
    expect(er?.creditedBy).toEqual([])
  })

  it('one course crediting two GEs shows up under both', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    expect(progress.find((p) => p.code === 'CC')?.satisfied).toBe(true)
    expect(progress.find((p) => p.code === 'ER')?.satisfied).toBe(true)
  })

  describe('DC', () => {
    it('is unsatisfied when the major has no sourced DC course list', () => {
      const progress = computeGEProgress(
        { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: 'Computer Science B.S.' },
        requirements,
      )
      expect(progress.find((p) => p.code === 'DC')?.satisfied).toBe(false)
    })
  })
})

describe('computeGEProgress assignments', () => {
  it('credits a multi-GE course only toward its assigned code', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null, assignments: { 'CRES 10': 'ER' } },
      requirements,
    )
    expect(progress.find((p) => p.code === 'CC')?.satisfied).toBe(false)
    expect(progress.find((p) => p.code === 'CC')?.creditedBy).toEqual([])
    expect(progress.find((p) => p.code === 'ER')?.creditedBy).toEqual([{ courseCode: 'CRES 10', status: 'taken' }])
  })

  it('leaves credit unaffected for a course with no assignment entry', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null, assignments: {} },
      requirements,
    )
    expect(progress.find((p) => p.code === 'CC')?.satisfied).toBe(true)
    expect(progress.find((p) => p.code === 'ER')?.satisfied).toBe(true)
  })

  it('defaults to crediting every tagged GE when assignments is omitted', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    expect(progress.find((p) => p.code === 'CC')?.satisfied).toBe(true)
    expect(progress.find((p) => p.code === 'ER')?.satisfied).toBe(true)
  })
})

describe('computeGESlots', () => {
  it('collapses a choice group into one slot, satisfied if any option is', () => {
    const slots = computeGESlots(
      { catalog, takenCourseCodes: ['THEA 80G'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    const pe = slots.find((s) => s.slotId === 'PE')
    expect(pe?.label).toBe('Perspectives')
    expect(pe?.satisfied).toBe(true)
    expect(pe?.options.map((o) => o.code)).toEqual(['PE-E', 'PE-T'])
  })

  it('keeps ungrouped requirements as their own slot keyed by code', () => {
    const slots = computeGESlots({ catalog, takenCourseCodes: [], plannedCourseCodes: [], majorCode: null }, requirements)
    expect(slots.find((s) => s.slotId === 'CC')?.label).toBe('Cross-Cultural Analysis')
  })
})

describe('findMultiGECourses', () => {
  it('flags a course credited toward more than one GE', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    const multi = findMultiGECourses(progress)
    expect(multi.get('CRES 10')?.sort()).toEqual(['CC', 'ER'])
  })

  it('omits a course credited toward only one GE', () => {
    const progress = computeGEProgress(
      { catalog, takenCourseCodes: ['AM 3'], plannedCourseCodes: [], majorCode: null },
      requirements,
    )
    expect(findMultiGECourses(progress).has('AM 3')).toBe(false)
  })

  it('keeps listing a course after it is assigned, so the picker that set the assignment stays reachable', () => {
    // GETrackerPage.tsx deliberately calls findMultiGECourses on progress
    // computed WITHOUT assignments applied, then separately computes the
    // displayed slots WITH assignments. Locks that composition in here since
    // it can't be observed from a component test (none exist in this repo).
    const unassignedProgress = computeGEProgress({ catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null }, requirements)
    const multi = findMultiGECourses(unassignedProgress)
    expect(multi.get('CRES 10')?.sort()).toEqual(['CC', 'ER'])

    const assignedProgress = computeGEProgress(
      { catalog, takenCourseCodes: ['CRES 10'], plannedCourseCodes: [], majorCode: null, assignments: { 'CRES 10': 'ER' } },
      requirements,
    )
    expect(findMultiGECourses(assignedProgress).has('CRES 10')).toBe(false)
  })
})

describe('applyGEAssignment', () => {
  it('adds an assignment for a course with no prior entry', () => {
    expect(applyGEAssignment({}, 'CRES 10', 'ER')).toEqual({ 'CRES 10': 'ER' })
  })

  it('overwrites an existing assignment for the same course', () => {
    expect(applyGEAssignment({ 'CRES 10': 'CC' }, 'CRES 10', 'ER')).toEqual({ 'CRES 10': 'ER' })
  })

  it('removes the assignment when geCode is empty ("count toward all")', () => {
    expect(applyGEAssignment({ 'CRES 10': 'ER' }, 'CRES 10', '')).toEqual({})
  })

  it('leaves other courses\' assignments untouched', () => {
    expect(applyGEAssignment({ 'AM 3': 'MF' }, 'CRES 10', 'ER')).toEqual({ 'AM 3': 'MF', 'CRES 10': 'ER' })
  })

  it('treats a null/undefined current map as empty', () => {
    expect(applyGEAssignment(null, 'CRES 10', 'ER')).toEqual({ 'CRES 10': 'ER' })
    expect(applyGEAssignment(undefined, 'CRES 10', 'ER')).toEqual({ 'CRES 10': 'ER' })
  })
})
