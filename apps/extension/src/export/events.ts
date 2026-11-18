// Pure plan -> calendar-event model. Both export paths (ics.ts for the .ics
// file, googleCalendar.ts for the API) render from this same list, so the two
// can't drift on which meetings a plan actually contains. No DOM, no storage,
// no chrome.* — same pure/impure split as conflicts.ts and geProgress.ts.

import type { Plan } from '../storage/types'

// UCSC is Pacific. Stated once here because both renderers need it: the .ics
// writer emits it as a TZID, the Google Calendar API wants it as a field.
export const UCSC_TIME_ZONE = 'America/Los_Angeles'

export interface CalendarEvent {
  summary: string
  location: string
  description: string
  // Local wall-clock timestamps, 'YYYYMMDDTHHMMSS' — no UTC offset baked in.
  // Both renderers pair them with UCSC_TIME_ZONE explicitly (a TZID +
  // VTIMEZONE in ics.ts, the API's own timeZone field in
  // googleCalendar.ts), which is what keeps a 10am class at 10am across the
  // DST change mid-quarter. Leaving them *floating* instead (no zone at all)
  // resolves to the reader's local zone, which is right for a student in
  // Santa Cruz but silently shifts every meeting for one importing from
  // another timezone — and some importers expand floating recurrences in UTC,
  // which shifts the post-DST half of the quarter by an hour.
  start: string
  end: string
  // iCal BYDAY codes ('MO','WE','FR') for the weekly recurrence.
  byDay: string[]
  // Total occurrences, i.e. RRULE COUNT. Used instead of UNTIL (which
  // V1_FEATURES_AND_TECH.md's Phase 6 sketch suggested) because UNTIL must be
  // a UTC instant when DTSTART isn't floating, which would drag DST offset
  // math into this file for no behavioral gain — COUNT is exact, and we
  // already know every occurrence date here.
  count: number
}

const DAY_CODE_TO_BYDAY: Record<string, string> = { Su: 'SU', M: 'MO', T: 'TU', W: 'WE', Th: 'TH', F: 'FR', Sa: 'SA' }
const DAY_CODE_TO_WEEKDAY: Record<string, number> = { Su: 0, M: 1, T: 2, W: 3, Th: 4, F: 5, Sa: 6 }

// 'YYYY-MM-DD' (what <input type="date"> produces) -> a Date pinned to noon
// UTC. Noon, not midnight: day-by-day arithmetic below then never lands on a
// different calendar day because of a timezone offset.
function parseIsoDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return null
  const [, year = '', month = '', day = ''] = m
  const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 12))
  return Number.isNaN(date.getTime()) ? null : date
}

function stampAt(date: Date, minuteOfDay: number): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0')
  const mi = String(minuteOfDay % 60).padStart(2, '0')
  return `${yyyy}${mm}${dd}T${hh}${mi}00`
}

/** 'YYYYMMDDTHHMMSS' -> RFC-3339 local date-time ('YYYY-MM-DDTHH:MM:SS'), which is the shape Google Calendar's API wants alongside an explicit timeZone. */
export function toRfc3339(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(stamp)
  if (!m) throw new Error(`SlugPath: not a local timestamp: ${stamp}`)
  const [, y, mo, d, h, mi, s] = m
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`
}

function occurrences(start: Date, end: Date, weekdays: Set<number>): Date[] {
  const dates: Date[] = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (weekdays.has(cursor.getUTCDay())) dates.push(new Date(cursor))
  }
  return dates
}

/**
 * One event per meeting pattern per section, recurring weekly within
 * `[range.start, range.end]` (inclusive, both 'YYYY-MM-DD').
 *
 * The range is passed in rather than looked up from a bundled academic
 * calendar: UCSC's real quarter start/end dates aren't in the catalog
 * snapshot, and guessing them would silently generate recurring events that
 * run for the wrong number of weeks — so the export UI asks for the dates
 * instead (same "don't ship guessed external data" call as
 * DC_COURSES_BY_MAJOR in geRequirements.ts).
 *
 * Returns [] for an unparseable range, and skips any meeting pattern with no
 * recognized day codes or no occurrence inside the range, rather than
 * throwing — a TBA/async section is valid data, not an error.
 */
export function planToEvents(plan: Plan, range: { start: string; end: string }): CalendarEvent[] {
  const start = parseIsoDate(range.start)
  const end = parseIsoDate(range.end)
  if (!start || !end || start > end) return []

  const events: CalendarEvent[] = []
  for (const section of plan.sections) {
    for (const pattern of section.meetingPattern) {
      const byDay = pattern.days.map((d) => DAY_CODE_TO_BYDAY[d]).filter((d): d is string => Boolean(d))
      const weekdays = new Set(pattern.days.map((d) => DAY_CODE_TO_WEEKDAY[d]).filter((n): n is number => n !== undefined))
      if (byDay.length === 0 || weekdays.size === 0) continue

      const dates = occurrences(start, end, weekdays)
      const first = dates[0]
      if (!first) continue

      events.push({
        summary: `${section.courseCode} ${section.sectionNumber}`,
        location: pattern.location,
        description: [section.instructor ? `Instructor: ${section.instructor}` : '', `SlugPath plan: ${plan.name}`]
          .filter(Boolean)
          .join('\n'),
        start: stampAt(first, pattern.startMinute),
        end: stampAt(first, pattern.endMinute),
        byDay,
        count: dates.length,
      })
    }
  }
  return events
}
