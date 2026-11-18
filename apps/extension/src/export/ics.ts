// CalendarEvent[] -> an RFC 5545 VCALENDAR string.
//
// Hand-rolled rather than pulling in the `ics` npm package
// (V1_FEATURES_AND_TECH.md named it): the subset of the format this needs is
// a header, one VEVENT per meeting with a weekly RRULE, text escaping and
// line folding — all of which is the ~40 lines below, and a dependency can't
// be fewer than that.

import { UCSC_TIME_ZONE, type CalendarEvent } from './events'

// The standard US-Pacific VTIMEZONE block, so DTSTART's TZID actually
// resolves in importers that don't ship an Olson database (and so a quarter
// that crosses the November DST change keeps a 10am class at 10am). The
// offsets/rules are the post-2007 US ones and are static — this is the same
// block Apple Calendar and Google emit.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${UCSC_TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0800',
  'TZOFFSETTO:-0700',
  'TZNAME:PDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0800',
  'TZNAME:PST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

// RFC 5545 §3.3.11: backslash, semicolon and comma are the escaped
// delimiters, and a literal newline becomes '\n'. CR is dropped so a CRLF in
// a description can't break out of the folded line.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n')
}

// RFC 5545 §3.1 caps a content line at 75 octets, continued by CRLF + a
// single space.
// ponytail: folds on characters, not octets — every field here is course
// codes, instructor names and room numbers, so the two only diverge for
// non-ASCII text, where a slightly-over-75-octet line is tolerated by
// importers while splitting mid-codepoint would not be. Switch to a
// TextEncoder-based fold if real multi-byte content ever shows up.
function foldLine(line: string): string {
  if (line.length <= 73) return line
  const chunks: string[] = [line.slice(0, 73)]
  for (let i = 73; i < line.length; i += 72) chunks.push(` ${line.slice(i, i + 72)}`)
  return chunks.join('\r\n')
}

function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

// Deterministic, so re-importing a regenerated file updates the same events
// instead of duplicating them (importers key on UID).
function uid(event: CalendarEvent): string {
  return `${event.summary.replace(/\s+/g, '-')}-${event.start}@slugpath.ucsc.edu`.toLowerCase()
}

export function eventsToIcs(events: CalendarEvent[], options?: { now?: Date }): string {
  const dtstamp = utcStamp(options?.now ?? new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SlugPath//UCSC Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
  ]

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid(event)}`,
      `DTSTAMP:${dtstamp}`,
      // Local wall clock plus an explicit zone (see CalendarEvent.start), not
      // a UTC instant — so the whole quarter stays at the same local time
      // either side of the DST change.
      `DTSTART;TZID=${UCSC_TIME_ZONE}:${event.start}`,
      `DTEND;TZID=${UCSC_TIME_ZONE}:${event.end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${event.byDay.join(',')};COUNT=${event.count}`,
      `SUMMARY:${escapeText(event.summary)}`,
    )
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

export function icsFilename(planName: string): string {
  const safe = planName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  return `${safe || 'slugpath-plan'}.ics`
}
