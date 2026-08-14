import type { Section } from '../storage/types'

export function sectionKey(section: Section): string {
  return `${section.courseCode} ${section.sectionNumber}`
}

function isLinked(a: Section, b: Section): boolean {
  const keyA = sectionKey(a)
  const keyB = sectionKey(b)
  // Check both directions defensively — link data should be symmetric but
  // don't assume it always is.
  return Boolean(a.linkedSectionKeys?.includes(keyB) || b.linkedSectionKeys?.includes(keyA))
}

export function sectionsConflict(a: Section, b: Section): boolean {
  if (isLinked(a, b)) return false

  for (const patternA of a.meetingPattern) {
    for (const patternB of b.meetingPattern) {
      const sharesDay = patternA.days.some((day) => patternB.days.includes(day))
      if (!sharesDay) continue
      const overlaps = patternA.startMinute < patternB.endMinute && patternB.startMinute < patternA.endMinute
      if (overlaps) return true
    }
  }
  return false
}

export function findConflicts(sections: Section[]): Array<{ a: Section; b: Section }> {
  const conflicts: Array<{ a: Section; b: Section }> = []
  for (const [i, a] of sections.entries()) {
    for (const b of sections.slice(i + 1)) {
      if (sectionsConflict(a, b)) conflicts.push({ a, b })
    }
  }
  return conflicts
}
