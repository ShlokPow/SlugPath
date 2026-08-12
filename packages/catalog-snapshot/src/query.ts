import type { CatalogSnapshot, CourseSnapshot } from './types'

export interface CatalogIndex {
  getCourse(code: string): CourseSnapshot | undefined
  search(query: string): CourseSnapshot[]
  coursesSatisfying(geCode: string): CourseSnapshot[]
}

function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase()
}

export function createCatalogIndex(snapshot: CatalogSnapshot): CatalogIndex {
  const byCode = new Map<string, CourseSnapshot>()
  for (const course of snapshot.courses) {
    byCode.set(normalizeCode(course.code), course)
  }

  return {
    getCourse(code) {
      return byCode.get(normalizeCode(code))
    },

    search(query) {
      const q = query.toLowerCase()
      return snapshot.courses.filter(
        (course) => course.code.toLowerCase().includes(q) || course.title.toLowerCase().includes(q),
      )
    },

    coursesSatisfying(geCode) {
      const target = geCode.toLowerCase()
      return snapshot.courses.filter((course) => course.geCodes.some((g) => g.toLowerCase() === target))
    },
  }
}
