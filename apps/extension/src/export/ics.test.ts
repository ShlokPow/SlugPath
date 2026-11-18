import { describe, expect, it } from 'vitest'
import { eventsToIcs, icsFilename } from './ics'
import type { CalendarEvent } from './events'

const event: CalendarEvent = {
  summary: 'CSE 101 01',
  location: 'Soc Sci 1 110',
  description: 'Instructor: J. Smith\nSlugPath plan: Fall',
  start: '20260928T100000',
  end: '20260928T110500',
  byDay: ['MO', 'WE', 'FR'],
  count: 6,
}

const now = new Date('2026-09-01T00:00:00Z')

describe('eventsToIcs', () => {
  it('emits a CRLF-terminated VCALENDAR with one recurring VEVENT', () => {
    const ics = eventsToIcs([event], { now })
    expect(ics.endsWith('\r\n')).toBe(true)
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('DTSTAMP:20260901T000000Z')
    expect(lines).toContain('DTSTART;TZID=America/Los_Angeles:20260928T100000')
    expect(lines).toContain('DTEND;TZID=America/Los_Angeles:20260928T110500')
    // The TZID above only resolves in importers without their own tz
    // database if the calendar carries the definition.
    expect(lines).toContain('BEGIN:VTIMEZONE')
    expect(lines).toContain('TZID:America/Los_Angeles')
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6')
    expect(lines).toContain('END:VCALENDAR')
  })

  it('escapes the RFC 5545 text delimiters and newlines', () => {
    const ics = eventsToIcs(
      [{ ...event, location: 'Room 1, Floor 2; back', description: 'a\nb', summary: 'back\\slash' }],
      { now },
    )
    expect(ics).toContain('LOCATION:Room 1\\, Floor 2\\; back')
    expect(ics).toContain('DESCRIPTION:a\\nb')
    expect(ics).toContain('SUMMARY:back\\\\slash')
  })

  it('folds long lines so no content line exceeds the 75-octet limit', () => {
    const ics = eventsToIcs([{ ...event, location: 'x'.repeat(300) }], { now })
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
    // Unfolding (drop CRLF + one leading space) must restore the original value.
    expect(ics.replace(/\r\n /g, '')).toContain(`LOCATION:${'x'.repeat(300)}`)
  })

  it('gives the same event the same UID across runs so a re-import updates instead of duplicating', () => {
    const uidOf = (ics: string) => ics.split('\r\n').find((l) => l.startsWith('UID:'))
    expect(uidOf(eventsToIcs([event], { now }))).toBe(uidOf(eventsToIcs([event], { now: new Date() })))
  })

  it('omits optional fields that are empty', () => {
    const ics = eventsToIcs([{ ...event, location: '', description: '' }], { now })
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
  })
})

describe('icsFilename', () => {
  it('slugifies a plan name', () => {
    expect(icsFilename('Fall 2026 (draft)')).toBe('Fall-2026-draft.ics')
  })

  it('falls back when a name has nothing usable in it', () => {
    expect(icsFilename('***')).toBe('slugpath-plan.ics')
  })
})
