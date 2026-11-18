import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Section } from '../storage/types'
import { WeeklyGrid } from './SchedulePanel'

// Day codes exactly as adapters/myucsc.ts emits them for a real "TuTh" row.
const section: Section = {
  courseCode: 'CSE 101',
  sectionNumber: '01',
  meetingPattern: [{ days: ['T', 'Th'], startMinute: 840, endMinute: 945, location: 'Soc Sci 1 141' }],
  instructor: 'Smith,J.',
  seatsOpen: 10,
}

describe('WeeklyGrid', () => {
  it('places an adapter-parsed section in its Tue and Thu columns', () => {
    const html = renderToStaticMarkup(<WeeklyGrid sections={[section]} conflictPartners={new Map()} />)
    expect(html).toContain('aria-label="CSE 101 01, Tue 2:00pm–3:45pm"')
    expect(html).toContain('aria-label="CSE 101 01, Thu 2:00pm–3:45pm"')
    expect(html.match(/role="note"/g)).toHaveLength(2)
  })
})
