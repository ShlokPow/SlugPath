// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCurrentTerm, parseSearchResults, waitForResults } from './myucsc'

// SYNTHETIC fixture — NOT a verbatim capture (unlike catalog.test.ts's
// fixture). MyUCSC is behind login and PeopleSoft-rendered, so it isn't
// something we can fetch and paste. This models PeopleSoft's real
// conventions as closely as we can from documentation/observed patterns:
// class-search results render as a grid table, one <tr> per section, with
// auto-generated field ids of the form `RECORDNAME_FIELDNAME$rownum`
// (the row-index suffix changes per render, the field name doesn't — the
// adapter selects on that stable substring). Linked sections (lecture +
// discussion, cross-listed courses) are modeled here as a `data-linked-keys`
// attribute on a `CLASS_LINKED$n` field, since MyUCSC's actual associated-
// class markup isn't something we have access to verify.
const TERM_HEADER = `
<div id="win0divDERIVED_SSS_SCT_SSS_TERM_LONG$0">
  <span id="DERIVED_SSS_SCT_SSS_TERM_LONG$0">Fall 2026</span>
</div>`

const RESULTS_TABLE = `
<table class="PSLEVEL1GRIDNBO" id="win0divSSR_CLSRSLT_WRK_GROUPBOX2">
  <tbody>
    <tr>
      <th>Status</th><th>Class Nbr</th><th>Course</th><th>Section</th>
      <th>Days &amp; Times</th><th>Room</th><th>Instructor</th><th>Seats</th>
    </tr>

    <!-- Row 0: MWF lecture, linked to its discussion section (row 1) -->
    <tr class="crsrow1" id="trSSR_CLSRSLT_WRK$0">
      <td><span id="CLASS_STATUS$0">Open</span></td>
      <td><span id="CLASS_NBR$0">40325</span></td>
      <td><span id="CLASS_SUBJ_CATLG$0">CSE 101</span></td>
      <td><span id="CLASS_SECTION$0">01</span></td>
      <td><span id="MTG_DAYTIME$0">MWF 10:00AM-10:50AM</span></td>
      <td><span id="MTG_ROOM$0">Physical Sciences 110</span></td>
      <td><span id="MTG_INSTR$0">J. Smith</span></td>
      <td><span id="CLASS_SEATS$0">5 / 30</span></td>
      <td><span id="CLASS_LINKED$0" data-linked-keys="CSE 101 01A"></span></td>
    </tr>

    <!-- Row 1: TTh discussion, linked back to the lecture (row 0) -->
    <tr class="crsrow2" id="trSSR_CLSRSLT_WRK$1">
      <td><span id="CLASS_STATUS$1">Open</span></td>
      <td><span id="CLASS_NBR$1">40326</span></td>
      <td><span id="CLASS_SUBJ_CATLG$1">CSE 101</span></td>
      <td><span id="CLASS_SECTION$1">01A</span></td>
      <td><span id="MTG_DAYTIME$1">TTh 2:00PM-3:45PM</span></td>
      <td><span id="MTG_ROOM$1">Soc Sci 1 141</span></td>
      <td><span id="MTG_INSTR$1">Staff</span></td>
      <td><span id="CLASS_SEATS$1">3 / 25</span></td>
      <td><span id="CLASS_LINKED$1" data-linked-keys="CSE 101 01"></span></td>
    </tr>

    <!-- Row 2: standalone section, no links, no open seats -->
    <tr class="crsrow1" id="trSSR_CLSRSLT_WRK$2">
      <td><span id="CLASS_STATUS$2">Closed</span></td>
      <td><span id="CLASS_NBR$2">41110</span></td>
      <td><span id="CLASS_SUBJ_CATLG$2">MATH 19A</span></td>
      <td><span id="CLASS_SECTION$2">01</span></td>
      <td><span id="MTG_DAYTIME$2">MWF 1:00PM-1:50PM</span></td>
      <td><span id="MTG_ROOM$2">Natural Sciences 2 101</span></td>
      <td><span id="MTG_INSTR$2">A. Nguyen</span></td>
      <td><span id="CLASS_SEATS$2">0 / 20</span></td>
    </tr>

    <!-- Row 3: async/TBA section — no meeting time to parse -->
    <tr class="crsrow2" id="trSSR_CLSRSLT_WRK$3">
      <td><span id="CLASS_STATUS$3">Open</span></td>
      <td><span id="CLASS_NBR$3">42250</span></td>
      <td><span id="CLASS_SUBJ_CATLG$3">PHYS 5</span></td>
      <td><span id="CLASS_SECTION$3">01</span></td>
      <td><span id="MTG_DAYTIME$3">TBA</span></td>
      <td><span id="MTG_ROOM$3">TBA</span></td>
      <td><span id="MTG_INSTR$3">Staff</span></td>
      <td><span id="CLASS_SEATS$3">10 / 40</span></td>
    </tr>
  </tbody>
</table>`

const FULL_FIXTURE = `${TERM_HEADER}${RESULTS_TABLE}`

describe('parseSearchResults (synthetic MyUCSC fixture, happy-dom)', () => {
  it('parses every class row into a Section plus its row element', () => {
    document.body.innerHTML = FULL_FIXTURE
    const results = parseSearchResults(document)

    expect(results.map((r) => `${r.section.courseCode} ${r.section.sectionNumber}`)).toEqual([
      'CSE 101 01',
      'CSE 101 01A',
      'MATH 19A 01',
      'PHYS 5 01',
    ])
    for (const { rowEl } of results) {
      expect(rowEl.tagName).toBe('TR')
    }
  })

  it('converts an MWF meeting time into correct minute-of-day math', () => {
    document.body.innerHTML = FULL_FIXTURE
    const [lecture] = parseSearchResults(document)
    expect(lecture?.section.meetingPattern).toEqual([
      { days: ['M', 'W', 'F'], startMinute: 600, endMinute: 650, location: 'Physical Sciences 110' },
    ])
  })

  it('converts a TTh meeting time into correct minute-of-day math', () => {
    document.body.innerHTML = FULL_FIXTURE
    const discussion = parseSearchResults(document)[1]
    expect(discussion?.section.meetingPattern).toEqual([
      { days: ['T', 'Th'], startMinute: 840, endMinute: 945, location: 'Soc Sci 1 141' },
    ])
  })

  it('produces matching linkedSectionKeys on both sides of a lecture+discussion pair', () => {
    document.body.innerHTML = FULL_FIXTURE
    const [lecture, discussion] = parseSearchResults(document)
    expect(lecture?.section.linkedSectionKeys).toEqual(['CSE 101 01A'])
    expect(discussion?.section.linkedSectionKeys).toEqual(['CSE 101 01'])
  })

  it('leaves linkedSectionKeys undefined for a section with no links', () => {
    document.body.innerHTML = FULL_FIXTURE
    const standalone = parseSearchResults(document)[2]
    expect(standalone?.section.linkedSectionKeys).toBeUndefined()
  })

  it('parses closed-section seat counts as 0 open seats', () => {
    document.body.innerHTML = FULL_FIXTURE
    const standalone = parseSearchResults(document)[2]
    expect(standalone?.section.seatsOpen).toBe(0)
  })

  it('produces an empty meetingPattern for a TBA/async row instead of throwing', () => {
    document.body.innerHTML = FULL_FIXTURE
    const tba = parseSearchResults(document)[3]
    expect(tba?.section.meetingPattern).toEqual([])
  })

  it('returns an empty array on a page with no results table', () => {
    document.body.innerHTML = '<p>no results yet</p>'
    expect(parseSearchResults(document)).toEqual([])
  })
})

describe('getCurrentTerm', () => {
  it('reads the currently selected term', () => {
    document.body.innerHTML = FULL_FIXTURE
    expect(getCurrentTerm(document)).toBe('Fall 2026')
  })

  it('returns null when the page has no term element', () => {
    document.body.innerHTML = '<p>not a MyUCSC page</p>'
    expect(getCurrentTerm(document)).toBeNull()
  })
})

describe('waitForResults', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('resolves once results are asynchronously added to the DOM', async () => {
    const promise = waitForResults(container, { timeoutMs: 1000 })
    setTimeout(() => {
      container.innerHTML = RESULTS_TABLE
    }, 0)

    const resultEl = await promise
    expect(resultEl).toBeInstanceOf(Element)
  })

  it('resolves immediately if results are already present', async () => {
    container.innerHTML = RESULTS_TABLE
    const resultEl = await waitForResults(container)
    expect(resultEl).toBeInstanceOf(Element)
  })

  it('rejects with a clear error if results never appear within the timeout', async () => {
    await expect(waitForResults(container, { timeoutMs: 20 })).rejects.toThrow(
      /no MyUCSC search results appeared/i,
    )
  })
})
