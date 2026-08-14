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
  // Other sections (by `${courseCode} ${sectionNumber}`) that must be picked
  // together with this one and never flagged as conflicting with each other
  // — cross-listed courses and lecture+lab pairs. Populated by the MyUCSC
  // adapter from DOM grouping; absent/empty means "stands alone".
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
}
