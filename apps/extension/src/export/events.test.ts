import { describe, expect, it } from 'vitest'
import { planToEvents, toRfc3339 } from './events'
import type { Plan, Section } from '../storage/types'

function plan(sections: Section[]): Plan {
  return { id: 'p1', name: 'Fall', term: 'Fall 2026', sections, createdAt: 0, updatedAt: 0 }
}

const mwfLecture: Section = {
  courseCode: 'CSE 101',
  sectionNumber: '01',
  instructor: 'J. Smith',
  seatsOpen: 5,
  meetingPattern: [{ days: ['M', 'W', 'F'], startMinute: 10 * 60, endMinute: 11 * 60 + 5, location: 'Soc Sci 1 110' }],
}

// 2026-09-28 is a Monday; 2026-10-09 is the Friday of the following week.
const range = { start: '2026-09-28', end: '2026-10-09' }

describe('planToEvents', () => {
  it('builds one weekly event per meeting pattern, starting on the first matching day', () => {
    const [event] = planToEvents(plan([mwfLecture]), range)
    expect(event).toMatchObject({
      summary: 'CSE 101 01',
      location: 'Soc Sci 1 110',
      start: '20260928T100000',
      end: '20260928T110500',
      byDay: ['MO', 'WE', 'FR'],
      count: 6, // M/W/F across two weeks
    })
    expect(event?.description).toContain('Instructor: J. Smith')
  })

  it("starts on the pattern's first day inside the range, not the range's first day", () => {
    const thursdayOnly: Section = {
      ...mwfLecture,
      meetingPattern: [{ days: ['Th'], startMinute: 14 * 60, endMinute: 15 * 60 + 45, location: '' }],
    }
    const [event] = planToEvents(plan([thursdayOnly]), range)
    // First Thursday after Monday 2026-09-28.
    expect(event?.start).toBe('20261001T140000')
    expect(event?.byDay).toEqual(['TH'])
    expect(event?.count).toBe(2)
  })

  it('skips sections with no parseable meeting pattern (TBA/async) instead of emitting a bad event', () => {
    expect(planToEvents(plan([{ ...mwfLecture, meetingPattern: [] }]), range)).toEqual([])
  })

  it('skips day codes it does not recognize', () => {
    const bogus: Section = { ...mwfLecture, meetingPattern: [{ days: ['Q'], startMinute: 600, endMinute: 660, location: '' }] }
    expect(planToEvents(plan([bogus]), range)).toEqual([])
  })

  it('returns nothing for a missing or inverted date range rather than throwing', () => {
    expect(planToEvents(plan([mwfLecture]), { start: '', end: '' })).toEqual([])
    expect(planToEvents(plan([mwfLecture]), { start: '2026-10-09', end: '2026-09-28' })).toEqual([])
  })

  it('emits one event per meeting pattern for a split-pattern section', () => {
    const split: Section = {
      ...mwfLecture,
      meetingPattern: [
        { days: ['T'], startMinute: 9 * 60, endMinute: 10 * 60, location: 'A' },
        { days: ['Th'], startMinute: 13 * 60, endMinute: 14 * 60, location: 'B' },
      ],
    }
    expect(planToEvents(plan([split]), range).map((e) => e.byDay)).toEqual([['TU'], ['TH']])
  })
})

describe('toRfc3339', () => {
  it('reshapes a local stamp for the Google Calendar API', () => {
    expect(toRfc3339('20260928T100000')).toBe('2026-09-28T10:00:00')
  })

  it('rejects anything that is not a local stamp', () => {
    expect(() => toRfc3339('2026-09-28')).toThrow()
  })
})
