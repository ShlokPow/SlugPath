export interface CourseSnapshot {
  /** e.g. "AM 3" — subject code, one space, catalog number */
  code: string
  title: string
  units: number
  /** Raw prose from the catalog's "Requirements" field; '' if the course has none */
  prereqRaw: string
  /** GE codes this course satisfies, e.g. ["PE-T"] or ["CC", "ER"]; [] if none */
  geCodes: string[]
  // ponytail: the catalog source page never exposes structured "terms offered"
  // data — always [] until a source that has it is wired in.
  termsOffered: string[]
}

export interface CatalogSnapshot {
  /** UCSC catalog year this snapshot was scraped from, e.g. "2026-2027" */
  version: string
  generatedAt: string
  courses: CourseSnapshot[]
}
