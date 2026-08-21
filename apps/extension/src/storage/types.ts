export interface MeetingPattern {
  days: string[]
  startMinute: number
  endMinute: number
  location: string
}

export interface Section {
  courseCode: string
  sectionNumber: string
  meetingPattern: MeetingPattern[]
  instructor: string
  seatsOpen: number
  // Other sections (by `${courseCode} ${sectionNumber}`, same format as
  // sectionKey()) that must be picked together with this one and never
  // flagged as conflicting with each other — cross-listed courses and
  // lecture+lab pairs. Populated by the MyUCSC adapter from DOM grouping;
  // absent/empty means "stands alone".
  linkedSectionKeys?: string[]
}

export interface Plan {
  id: string
  name: string
  term: string
  sections: Section[]
  createdAt: number
  updatedAt: number
}

export interface TakenCourse {
  courseCode: string
  term: string
  gradeSelfReported?: string
}

export interface CatalogCacheEntry {
  courseCode: string
  catalogYear: string
  // ponytail: snapshot shape isn't defined until Phase 2's catalog snapshot format lands
  snapshot: unknown
  fetchedAt: number
}

export interface Settings {
  majorCode: string | null
  catalogYear: string | null
  calendarLinked: boolean
  defaultTerm: string | null
  activePlanId: string | null
  // courseCode -> GE code, from the GE tracker's "pick a primary GE" picker
  // for courses that double-dip toward 2+ GEs. See docs/migrations.md.
  geAssignments: Record<string, string> | null
  // GE codes the MyUCSC Degree Progress Report reported satisfied on last
  // import (adapters/degreeProgress.ts), for any category that was
  // collapsed at import time and so has no specific course to credit.
  degreeProgressGECodes: string[] | null
  degreeProgressImportedAt: number | null
}
