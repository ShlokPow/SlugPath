// Pure GE-progress computation — no storage/DOM access, same pure/impure
// split as prereq-graph's graphModel.ts used to be. Takes plain data in,
// returns plain data out, so both the inline row badges and the standalone
// tracker page can share one source of truth for "is this GE covered".
import type { CatalogIndex } from '@slugpath/catalog-snapshot'
import { DC_COURSES_BY_MAJOR, GE_GROUP_LABELS, GE_REQUIREMENTS, type GERequirement } from '@slugpath/catalog-snapshot'

export type GECreditStatus = 'taken' | 'planned'

export interface GECredit {
  courseCode: string
  status: GECreditStatus
}

export interface GEProgress {
  code: string
  name: string
  description: string
  group?: string
  creditedBy: GECredit[]
  satisfied: boolean
}

export interface GESlot {
  // The group name for a grouped requirement (e.g. "PE"), otherwise the
  // requirement's own code — a stable id for one requirement "row".
  slotId: string
  label: string
  options: GEProgress[]
  satisfied: boolean
}

export interface GEProgressInput {
  catalog: CatalogIndex
  takenCourseCodes: string[]
  plannedCourseCodes: string[]
  majorCode: string | null
  // courseCode -> GE code, from the "pick a primary GE" assignment UI for
  // courses tagged toward 2+ GEs. A course with an entry here only credits
  // its assigned code; omitted (default undefined, same as before this field
  // existed) keeps crediting every GE it's tagged for — MyUCSC row badges
  // rely on that default and pass no assignments.
  assignments?: Record<string, string>
}

function creditsFor(code: string, input: GEProgressInput): GECredit[] {
  const credits: GECredit[] = []
  const seen = new Set<string>()
  const add = (courseCode: string, status: GECreditStatus) => {
    if (seen.has(courseCode)) return
    const assigned = input.assignments?.[courseCode]
    if (assigned && assigned !== code) return
    seen.add(courseCode)
    credits.push({ courseCode, status })
  }

  if (code === 'DC') {
    const dcCourses = new Set((input.majorCode && DC_COURSES_BY_MAJOR[input.majorCode]) || [])
    for (const courseCode of input.takenCourseCodes) if (dcCourses.has(courseCode)) add(courseCode, 'taken')
    for (const courseCode of input.plannedCourseCodes) if (dcCourses.has(courseCode)) add(courseCode, 'planned')
    return credits
  }

  for (const courseCode of input.takenCourseCodes) {
    if (input.catalog.getCourse(courseCode)?.geCodes.includes(code)) add(courseCode, 'taken')
  }
  for (const courseCode of input.plannedCourseCodes) {
    if (input.catalog.getCourse(courseCode)?.geCodes.includes(code)) add(courseCode, 'planned')
  }
  return credits
}

export function computeGEProgress(input: GEProgressInput, requirements: GERequirement[] = GE_REQUIREMENTS): GEProgress[] {
  return requirements.map((req) => {
    const creditedBy = creditsFor(req.code, input)
    return { ...req, creditedBy, satisfied: creditedBy.length > 0 }
  })
}

/** Collapses grouped requirements (Perspectives, Practice) into one slot each, so a
 * progress summary counts requirement *slots* (11) rather than flat codes (15). */
export function computeGESlots(input: GEProgressInput, requirements: GERequirement[] = GE_REQUIREMENTS): GESlot[] {
  const progress = computeGEProgress(input, requirements)
  const slots = new Map<string, GESlot>()
  for (const p of progress) {
    const slotId = p.group ?? p.code
    const existing = slots.get(slotId)
    if (existing) {
      existing.options.push(p)
      existing.satisfied = existing.satisfied || p.satisfied
    } else {
      slots.set(slotId, {
        slotId,
        label: p.group ? (GE_GROUP_LABELS[p.group] ?? p.group) : p.name,
        options: [p],
        satisfied: p.satisfied,
      })
    }
  }
  return [...slots.values()]
}

/** Courses that are credited toward more than one GE at once — the set the
 * "assignment UI" (per the Phase 5 spec) lets a user pick a primary GE for. */
export function findMultiGECourses(progress: GEProgress[]): Map<string, string[]> {
  const byCourse = new Map<string, string[]>()
  for (const p of progress) {
    for (const credit of p.creditedBy) {
      const codes = byCourse.get(credit.courseCode) ?? []
      codes.push(p.code)
      byCourse.set(credit.courseCode, codes)
    }
  }
  for (const [courseCode, codes] of byCourse) {
    if (codes.length < 2) byCourse.delete(courseCode)
  }
  return byCourse
}
