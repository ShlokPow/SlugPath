import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { parsePrereq } from '@slugpath/prereq-parser'
import { usePlans, useTakenCourses } from '../storage/hooks'
import { loadCatalog } from './catalogSnapshot'
import { normalizeCode, toPrereqSegment, type PrereqSegment } from './prereqText'

/**
 * Direct-prereqs-only popover: shows what a single course requires, as text,
 * with no recursion into those courses' own prereqs and no graph layout.
 * The tree view in PrereqGraphPanel already covers the "explore the whole
 * chain" use case; this is for the narrower "do I have what this needs"
 * glance while scanning class search results.
 */
export function PrereqPopover({ courseCode }: { courseCode: string }) {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c)
      })
      .catch((err: unknown) => console.error('SlugPath: failed to load catalog snapshot', err))
    return () => {
      cancelled = true
    }
  }, [])

  const plans = usePlans()
  const takenCourses = useTakenCourses()

  const plannedCodes = useMemo(() => {
    const set = new Set<string>()
    for (const plan of plans ?? []) {
      for (const section of plan.sections) set.add(normalizeCode(section.courseCode))
    }
    return set
  }, [plans])

  const takenCodes = useMemo(() => {
    const set = new Set<string>()
    for (const taken of takenCourses ?? []) set.add(normalizeCode(taken.courseCode))
    return set
  }, [takenCourses])

  const course = catalog?.index.getCourse(courseCode)

  let body: ReactNode
  if (!catalog) {
    body = 'Loading…'
  } else if (!course) {
    body = `No catalog data for ${courseCode}.`
  } else if (!course.prereqRaw) {
    body = 'No prerequisites.'
  } else {
    const result = parsePrereq(course.prereqRaw)
    body = result.ok ? (
      renderSegment(toPrereqSegment(result.ast), takenCodes, plannedCodes)
    ) : (
      <span style={{ fontStyle: 'italic' }}>{course.prereqRaw}</span>
    )
  }

  return (
    <div
      style={{
        maxWidth: 320,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid #003c6c',
        background: '#fff',
        color: '#111',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{course?.code ?? courseCode} prerequisites</div>
      {body}
    </div>
  )
}

function courseChip(code: string, taken: boolean, planned: boolean): ReactNode {
  return (
    <span
      key={code}
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 6,
        border: '1px solid #003c6c',
        background: taken ? '#d7f5dd' : planned ? '#fff3cd' : '#f5f5f5',
        fontWeight: 600,
      }}
    >
      {code}
    </span>
  )
}

/** Renders one prereq display segment as inline text. Constraint details render as a trailing italic note. */
function renderSegment(segment: PrereqSegment, takenCodes: Set<string>, plannedCodes: Set<string>): ReactNode {
  if (segment.kind === 'course') {
    const normalized = normalizeCode(segment.code)
    return courseChip(segment.code, takenCodes.has(normalized), plannedCodes.has(normalized))
  }

  if (segment.kind === 'group') {
    const joiner = segment.op === 'AND' ? ' and ' : ' or '
    return (
      <>
        {segment.children.map((child, i) => (
          <span key={i}>
            {i > 0 && joiner}
            {child.kind === 'group' ? <>({renderSegment(child, takenCodes, plannedCodes)})</> : renderSegment(child, takenCodes, plannedCodes)}
          </span>
        ))}
      </>
    )
  }

  // note
  return (
    <>
      {segment.child && renderSegment(segment.child, takenCodes, plannedCodes)}
      <span style={{ fontStyle: 'italic', color: '#555' }}>
        {segment.child ? ' — ' : ''}
        {segment.detail}
      </span>
    </>
  )
}
