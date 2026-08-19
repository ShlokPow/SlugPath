// Every my.ucsc.edu class-search DOM selector lives in this one file —
// mirrors the catalog adapter pattern (see catalog.ts) so a DOM change is a
// single-file fix.
//
// The results grid is NOT rendered by PeopleSoft itself: my.ucsc.edu's
// "Main Content" iframe navigates to a UCSC-built results page served from
// pisa.ucsc.edu (Bootstrap-based, one `<div class="panel panel-default row"
// id="rowpanel_N">` per section, N reassigned every render). Selectors
// below match on those stable id prefixes / icon classes rather than exact
// ids or table structure. Verified 2026-08-18 against a real captured row
// (see myucsc.test.ts) — an earlier version of this file targeted
// PeopleSoft-classic `<tr>`/`RECORDNAME_FIELDNAME$n` markup that doesn't
// exist on the current site at all.

import type { MeetingPattern, Section } from '../storage/types'

// Day-code convention used everywhere in this file (and expected by the
// conflict detector that will consume `MeetingPattern.days`): single letters
// for M/T/W/F, 'Th' for Thursday (the one two-letter code, since 'T' alone
// is already taken by Tuesday). MyUCSC renders combined strings like "MWF"
// or "TTh"/"TuTh"; both raw spellings of Tuesday are accepted below and
// normalized to 'T'.
const DAY_TOKENS: ReadonlyArray<readonly [raw: string, code: string]> = [
  ['Th', 'Th'],
  ['Tu', 'T'],
  ['Su', 'Su'],
  ['Sa', 'Sa'],
  ['M', 'M'],
  ['T', 'T'],
  ['W', 'W'],
  ['F', 'F'],
]

function parseDays(raw: string): string[] {
  const days: string[] = []
  let i = 0
  while (i < raw.length) {
    const token = DAY_TOKENS.find(([r]) => raw.startsWith(r, i))
    if (!token) {
      i += 1 // unrecognized character (whitespace, stray punctuation) — skip defensively
      continue
    }
    days.push(token[1])
    i += token[0].length
  }
  return days
}

// "10:00AM" / "2:00 PM" -> minutes since midnight. Returns null on anything
// that doesn't parse cleanly so callers can skip the row instead of throwing.
function parseClockToMinutes(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim())
  if (!m) return null
  const [, hourStr = '', minuteStr = '', meridiemRaw = ''] = m
  let hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const meridiem = meridiemRaw.toUpperCase()
  if (hour === 12) hour = 0 // 12:xxAM is midnight hour 0, 12:xxPM is noon hour 0 (+12 below)
  if (meridiem === 'PM') hour += 12
  return hour * 60 + minute
}

// MyUCSC renders meeting time as e.g. "MWF 10:00AM-10:50AM" or "TTh
// 2:00PM-3:45PM"; async/TBA sections render "TBA" with no time. Anything
// that doesn't match the expected shape yields [] rather than throwing —
// per spec, a row with no scheduled meeting time is valid, not an error.
function parseMeetingTime(daytimeText: string, room: string): MeetingPattern[] {
  const trimmed = daytimeText.trim()
  if (!trimmed || /^TBA$/i.test(trimmed)) return []

  const match = /^([A-Za-z]+)\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i.exec(trimmed)
  if (!match) return []

  const [, daysRaw = '', startRaw = '', endRaw = ''] = match
  const days = parseDays(daysRaw)
  const startMinute = parseClockToMinutes(startRaw)
  const endMinute = parseClockToMinutes(endRaw)
  if (days.length === 0 || startMinute === null || endMinute === null) return []

  return [{ days, startMinute, endMinute, location: room.trim() }]
}

// "60 of 70 Enrolled" -> 10 open (capacity - enrolled). Any other shape
// defaults to 0 (unparseable reads as "no open seats" rather than throwing).
function parseSeatsOpen(rowText: string): number {
  const m = /(\d+)\s+of\s+(\d+)\s+Enrolled/i.exec(rowText)
  if (!m?.[1] || !m[2]) return 0
  return Math.max(0, parseInt(m[2], 10) - parseInt(m[1], 10))
}

// Each meeting-pattern field is a `<div>` whose only child element with
// class `iconClass` is a Font Awesome icon (`.fa-user`, `.fa-clock-o`, ...)
// immediately followed by a visually-hidden `.sr-only` label and then the
// actual value as trailing text — e.g. `<i class="fa fa-user">
// <i class="sr-only">Instructor:</i> J. Smith`. Reads the icon's parent's
// full text and strips the label back off, since sr-only text is still
// part of textContent.
function fieldByIcon(rowEl: Element, iconClass: string, label: string): string {
  const icon = rowEl.querySelector(`.${iconClass}`)
  return (icon?.parentElement?.textContent ?? '').replace(label, '').trim()
}

export function parseSearchResults(root: ParentNode): { section: Section; rowEl: Element }[] {
  const results: { section: Section; rowEl: Element }[] = []

  for (const rowEl of root.querySelectorAll('[id^="rowpanel_"]')) {
    try {
      // Header anchor text is e.g. SUBJ NUM - SECTION, then a run of nbsp
      // chars, then the title (plain spaces inside the code/section itself,
      // so split on a single nbsp char and take the first piece).
      const headerText = rowEl.querySelector('.panel-heading-custom h2 a')?.textContent ?? ''
      const [codeAndSection] = headerText.split(String.fromCharCode(160))
      const m = /^(.+?)\s+-\s+(\S+)$/.exec((codeAndSection ?? '').trim())
      const courseCode = m?.[1]?.trim() ?? ''
      const sectionNumber = m?.[2]?.trim() ?? ''
      if (!courseCode || !sectionNumber) continue // can't key a section without both

      const instructor = fieldByIcon(rowEl, 'fa-user', 'Instructor:')
      // Location text is like "LEC: Soc Sci 1 110" -- strip the instruction-type prefix.
      const room = fieldByIcon(rowEl, 'fa-location-arrow', 'Location:').replace(/^[A-Za-z]+:\s*/, '')
      const daytime = fieldByIcon(rowEl, 'fa-clock-o', 'Day and Time:')
      const meetingPattern = parseMeetingTime(daytime, room)
      const seatsOpen = parseSeatsOpen(rowEl.textContent ?? '')

      // ponytail: no verified real markup yet for cross-listed/linked
      // sections (lecture+discussion grouping) on this page — leaving
      // linkedSectionKeys unset rather than guessing. Add real detection
      // here once a captured row with a cross-listed section is available.
      const section: Section = { courseCode, sectionNumber, meetingPattern, instructor, seatsOpen }
      results.push({ section, rowEl })
    } catch {
      // One malformed row should never take down the whole results parse.
      continue
    }
  }

  return results
}

// ponytail: unverified against the current site (no production caller uses
// it), left as the prior best-guess selector. Fix alongside real markup if
// this becomes load-bearing.
export function getCurrentTerm(root: ParentNode): string | null {
  const text = root.querySelector('[id*="TERM_LONG"], [id*="SSR_CLASS_TERM"]')?.textContent?.trim()
  return text ? text : null
}

function hasResults(root: ParentNode): Element | null {
  return root.querySelector('[id^="rowpanel_"]')
}

// MyUCSC's search results load asynchronously into the DOM (PeopleSoft's
// iframe/panel refresh), so callers can't just query on page load — they
// need to wait for rows to appear. A MutationObserver on the results
// container is the standard way to detect that without polling. 8s default
// timeout is generous for a slow PeopleSoft round-trip while still failing
// fast enough to show the user a "results didn't load" fallback instead of
// hanging forever.
export function waitForResults(root: ParentNode, options?: { timeoutMs?: number }): Promise<Element> {
  const timeoutMs = options?.timeoutMs ?? 8000

  return new Promise((resolve, reject) => {
    const existing = hasResults(root)
    if (existing) {
      resolve(existing)
      return
    }

    const observer = new MutationObserver(() => {
      const found = hasResults(root)
      if (found) {
        cleanup()
        resolve(found)
      }
    })
    // ParentNode's concrete implementers (Document, Element, DocumentFragment)
    // are always Nodes; ParentNode itself just doesn't say so.
    observer.observe(root as unknown as Node, { childList: true, subtree: true })

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`waitForResults: no MyUCSC search results appeared within ${timeoutMs}ms`))
    }, timeoutMs)

    function cleanup() {
      observer.disconnect()
      clearTimeout(timer)
    }
  })
}
