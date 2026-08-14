// Every my.ucsc.edu (MyUCSC / PeopleSoft) DOM selector lives in this one
// file — mirrors the catalog adapter pattern (see catalog.ts and
// V1_FEATURES_AND_TECH.md) so a PeopleSoft DOM change is a single-file fix.
// PeopleSoft auto-generates element ids as `RECORDNAME_FIELDNAME$rownum`
// (row index changes per render, field name doesn't), so selectors below
// match on the stable field-name substring via `[id*="..."]` rather than
// exact ids — the standard resilient-scraping approach for this platform.

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

// "5 / 30" (available / capacity) -> 5. Any other shape defaults to 0
// (closed/unparseable reads as "no open seats" rather than throwing).
function parseSeatsOpen(seatsText: string): number {
  const m = /^(\d+)\s*\/\s*\d+$/.exec(seatsText.trim())
  return m?.[1] ? parseInt(m[1], 10) : 0
}

function fieldText(row: Element, idPart: string): string {
  return row.querySelector(`[id*="${idPart}"]`)?.textContent?.trim() ?? ''
}

export function parseSearchResults(root: ParentNode): { section: Section; rowEl: Element }[] {
  const results: { section: Section; rowEl: Element }[] = []

  for (const nbrEl of root.querySelectorAll('[id*="CLASS_NBR"]')) {
    try {
      const rowEl = nbrEl.closest('tr')
      if (!rowEl) continue

      const courseCode = fieldText(rowEl, 'CLASS_SUBJ_CATLG')
      const sectionNumber = fieldText(rowEl, 'CLASS_SECTION')
      if (!courseCode || !sectionNumber) continue // can't key a section without both

      const daytime = fieldText(rowEl, 'MTG_DAYTIME')
      const room = fieldText(rowEl, 'MTG_ROOM')
      const instructor = fieldText(rowEl, 'MTG_INSTR')
      const meetingPattern = parseMeetingTime(daytime, room)
      const seatsOpen = parseSeatsOpen(fieldText(rowEl, 'CLASS_SEATS'))

      const linkedRaw = rowEl.querySelector('[id*="CLASS_LINKED"]')?.getAttribute('data-linked-keys')
      const linkedSectionKeys = linkedRaw
        ? linkedRaw
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined

      const section: Section = {
        courseCode,
        sectionNumber,
        meetingPattern,
        instructor,
        seatsOpen,
        ...(linkedSectionKeys && linkedSectionKeys.length > 0 ? { linkedSectionKeys } : {}),
      }
      results.push({ section, rowEl })
    } catch {
      // One malformed row should never take down the whole results parse.
      continue
    }
  }

  return results
}

export function getCurrentTerm(root: ParentNode): string | null {
  const text = root.querySelector('[id*="TERM_LONG"], [id*="SSR_CLASS_TERM"]')?.textContent?.trim()
  return text ? text : null
}

function hasResults(root: ParentNode): Element | null {
  return root.querySelector('[id*="CLASS_NBR"]')
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
