import type { CourseSnapshot } from '../../packages/catalog-snapshot/src/types.ts'
import { htmlToText } from './html-text.ts'

export type ParsedCourse = Omit<CourseSnapshot, 'termsOffered'>

export interface SubjectIndex {
  version: string
  subjectSlugs: string[]
}

const SUBJECT_LINK_RE = /href="\/en\/current\/general-catalog\/courses\/([a-z0-9-]+)"/g
const VERSION_RE = /(\d{4}-\d{4}) UCSC General Catalog/

/**
 * Parses the subject index page: every subject slug to fetch next, and the
 * catalog year (from the breadcrumb) to stamp on the snapshot.
 */
export function parseSubjectIndexHtml(html: string): SubjectIndex {
  const slugs = new Set<string>()
  SUBJECT_LINK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SUBJECT_LINK_RE.exec(html))) {
    const slug = match[1]
    if (slug) slugs.add(slug)
  }

  const versionMatch = VERSION_RE.exec(html)
  if (!versionMatch?.[1]) {
    throw new Error('parseSubjectIndexHtml: could not find catalog version (e.g. "2026-2027") on index page')
  }

  return { version: versionMatch[1], subjectSlugs: [...slugs] }
}

const COURSE_HEADER_START_RE = /<h2 class="course-name">/g
const COURSE_HEADER_RE =
  /<h2 class="course-name">\s*<a[^>]*>\s*<span>([\s\S]*?)<\/span>([\s\S]*?)<\/a>/
const CREDITS_RE = /<div class="sc-credithours">[\s\S]*?<div class="credits">([\s\S]*?)<\/div>/
const EXTRA_FIELDS_RE = /<div class="extraFields">([\s\S]*?)<\/div>/g
const GEN_ED_RE = /<div class="genEd">([\s\S]*?)<\/div>/
const H4_RE = /<h4>([\s\S]*?)<\/h4>/
const P_RE = /<p>([\s\S]*?)<\/p>/

/**
 * Parses a subject page (e.g. .../courses/am-applied-mathematics) into its
 * course list. Pure string -> data, no I/O — keeps this testable against
 * fixture HTML without a network call.
 */
export function parseSubjectPageHtml(html: string): ParsedCourse[] {
  const chunkStarts: number[] = []
  COURSE_HEADER_START_RE.lastIndex = 0
  let startMatch: RegExpExecArray | null
  while ((startMatch = COURSE_HEADER_START_RE.exec(html))) {
    chunkStarts.push(startMatch.index)
  }

  const courses: ParsedCourse[] = []
  for (let i = 0; i < chunkStarts.length; i++) {
    const start = chunkStarts[i]
    if (start === undefined) continue
    const end = chunkStarts[i + 1] ?? html.length
    const course = parseCourseChunk(html.slice(start, end))
    if (course) courses.push(course)
  }
  return courses
}

/** One `<h2 class="course-name">` chunk -> a course, or null if it's not a real course block. */
function parseCourseChunk(chunk: string): ParsedCourse | null {
  const headerMatch = COURSE_HEADER_RE.exec(chunk)
  if (!headerMatch) return null

  const code = htmlToText(headerMatch[1] ?? '')
  const title = htmlToText(headerMatch[2] ?? '')
  if (!code || !title) return null

  const creditsMatch = CREDITS_RE.exec(chunk)
  const creditsDigits = creditsMatch ? /\d+/.exec(htmlToText(creditsMatch[1] ?? '')) : null
  const units = creditsDigits ? Number(creditsDigits[0]) : 0

  let prereqRaw = ''
  EXTRA_FIELDS_RE.lastIndex = 0
  let extraMatch: RegExpExecArray | null
  while ((extraMatch = EXTRA_FIELDS_RE.exec(chunk))) {
    const block = extraMatch[1] ?? ''
    const label = htmlToText(H4_RE.exec(block)?.[1] ?? '')
    if (label === 'Requirements') {
      prereqRaw = htmlToText(P_RE.exec(block)?.[1] ?? '')
      break
    }
  }

  let geCodes: string[] = []
  const genEdBlock = GEN_ED_RE.exec(chunk)?.[1]
  if (genEdBlock) {
    const codesText = htmlToText(P_RE.exec(genEdBlock)?.[1] ?? '')
    geCodes = codesText
      ? codesText
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean)
      : []
  }

  return { code, title, units, prereqRaw, geCodes }
}
