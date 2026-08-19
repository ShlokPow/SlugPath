// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCurrentTerm, parseSearchResults, waitForResults } from './myucsc'

// Row 0 is a VERBATIM capture (outer HTML, via DevTools) of a real
// pisa.ucsc.edu class-search result -- the page my.ucsc.edu's "Main
// Content" iframe actually navigates to for class search (see the header
// comment in myucsc.ts). Rows 1-3 are constructed by analogy to exercise
// cases the captured row doesn't (closed section, async/TBA meeting time)
// -- not verified against a real capture.
const RESULTS_FIXTURE = `
<div class="panel panel-default row" style="margin-top: 0px; margin-bottom: 0px;" id="rowpanel_0">
  <div class="panel-heading panel-heading-custom"><h2 style="margin:0px;"><a id="class_id_10225" href="#">ANTH 130F - 01&nbsp;&nbsp;&nbsp;Blackness In Motion</a></h2></div>
  <div class="panel-body" style="padding-top: 0px;">
    <div class="row ">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_10225" href="#">10225</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user" aria-hidden="true"></i><i class="sr-only">Instructor:</i> Shange-Binion,S.T.</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow" aria-hidden="true"></i><i class="sr-only">Location:</i> LEC: Soc Sci 1 110</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o" aria-hidden="true"></i><i class="sr-only">Day and Time:</i> MW 05:20PM-06:55PM  </div>
      </div>
      <div class="col-xs-6 col-sm-3"> 60 of 70 Enrolled</div>
      <div class="col-xs-6 col-sm-3 hide-print"><a href="#"><i class="fa fa-cart-plus" aria-hidden="true"></i> Add to Cart</a></div>
      <div class="col-xs-6 col-sm-3 hide-print"><i class="sr-only">Instruction Mode:</i><b>In Person</b></div>
    </div>
  </div>
</div>

<div class="panel panel-default row" style="margin-top: 0px; margin-bottom: 0px;" id="rowpanel_1">
  <div class="panel-heading panel-heading-custom"><h2 style="margin:0px;"><a id="class_id_40326" href="#">CSE 101 - 01A&nbsp;&nbsp;&nbsp;Software Engineering</a></h2></div>
  <div class="panel-body" style="padding-top: 0px;">
    <div class="row ">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_40326" href="#">40326</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user" aria-hidden="true"></i><i class="sr-only">Instructor:</i> Staff</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow" aria-hidden="true"></i><i class="sr-only">Location:</i> DIS: Soc Sci 1 141</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o" aria-hidden="true"></i><i class="sr-only">Day and Time:</i> TTh 2:00PM-3:45PM  </div>
      </div>
      <div class="col-xs-6 col-sm-3"> 3 of 25 Enrolled</div>
    </div>
  </div>
</div>

<div class="panel panel-default row" style="margin-top: 0px; margin-bottom: 0px;" id="rowpanel_2">
  <div class="panel-heading panel-heading-custom"><h2 style="margin:0px;"><a id="class_id_41110" href="#">MATH 19A - 01&nbsp;&nbsp;&nbsp;Calculus For Science, Engineering</a></h2></div>
  <div class="panel-body" style="padding-top: 0px;">
    <div class="row ">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_41110" href="#">41110</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user" aria-hidden="true"></i><i class="sr-only">Instructor:</i> A. Nguyen</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow" aria-hidden="true"></i><i class="sr-only">Location:</i> LEC: Natural Sciences 2 101</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o" aria-hidden="true"></i><i class="sr-only">Day and Time:</i> MWF 1:00PM-1:50PM  </div>
      </div>
      <div class="col-xs-6 col-sm-3"> 20 of 20 Enrolled</div>
    </div>
  </div>
</div>

<div class="panel panel-default row" style="margin-top: 0px; margin-bottom: 0px;" id="rowpanel_3">
  <div class="panel-heading panel-heading-custom"><h2 style="margin:0px;"><a id="class_id_42250" href="#">PHYS 5 - 01&nbsp;&nbsp;&nbsp;Introduction To Physics</a></h2></div>
  <div class="panel-body" style="padding-top: 0px;">
    <div class="row ">
      <div class="col-xs-6 col-sm-3">Class Number: <a id="class_nbr_42250" href="#">42250</a></div>
      <div class="col-xs-6 col-sm-3"><i class="fa fa-user" aria-hidden="true"></i><i class="sr-only">Instructor:</i> Staff</div>
      <div class="col-xs-12 col-sm-6">
        <div class="col-xs-6 col-sm-6"><i class="fa fa-location-arrow" aria-hidden="true"></i><i class="sr-only">Location:</i> Asynchronous Online</div>
        <div class="col-xs-6 col-sm-6"><i class="fa fa-clock-o" aria-hidden="true"></i><i class="sr-only">Day and Time:</i> Asynchronous Online  </div>
      </div>
      <div class="col-xs-6 col-sm-3"> 10 of 40 Enrolled</div>
    </div>
  </div>
</div>`

describe('parseSearchResults (pisa.ucsc.edu fixture, happy-dom)', () => {
  it('parses every class row into a Section plus its row element', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const results = parseSearchResults(document)

    expect(results.map((r) => `${r.section.courseCode} ${r.section.sectionNumber}`)).toEqual([
      'ANTH 130F 01',
      'CSE 101 01A',
      'MATH 19A 01',
      'PHYS 5 01',
    ])
    for (const { rowEl } of results) {
      expect(rowEl.id).toMatch(/^rowpanel_\d+$/)
    }
  })

  it('parses the instructor and strips the modality prefix off the room', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const [lecture] = parseSearchResults(document)
    expect(lecture?.section.instructor).toBe('Shange-Binion,S.T.')
    expect(lecture?.section.meetingPattern[0]?.location).toBe('Soc Sci 1 110')
  })

  it('converts an MW meeting time into correct minute-of-day math', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const [lecture] = parseSearchResults(document)
    expect(lecture?.section.meetingPattern).toEqual([
      { days: ['M', 'W'], startMinute: 1040, endMinute: 1135, location: 'Soc Sci 1 110' },
    ])
  })

  it('converts a TTh meeting time into correct minute-of-day math', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const discussion = parseSearchResults(document)[1]
    expect(discussion?.section.meetingPattern).toEqual([
      { days: ['T', 'Th'], startMinute: 840, endMinute: 945, location: 'Soc Sci 1 141' },
    ])
  })

  it('computes open seats as capacity minus enrolled', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const [lecture] = parseSearchResults(document)
    expect(lecture?.section.seatsOpen).toBe(10)
  })

  it('reads 0 open seats for a fully enrolled section', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const full = parseSearchResults(document)[2]
    expect(full?.section.seatsOpen).toBe(0)
  })

  it('produces an empty meetingPattern for an asynchronous/TBA row instead of throwing', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    const async_ = parseSearchResults(document)[3]
    expect(async_?.section.meetingPattern).toEqual([])
  })

  it('returns an empty array on a page with no results grid', () => {
    document.body.innerHTML = '<p>no results yet</p>'
    expect(parseSearchResults(document)).toEqual([])
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
      container.innerHTML = RESULTS_FIXTURE
    }, 0)

    const resultEl = await promise
    expect(resultEl).toBeInstanceOf(Element)
  })

  it('resolves immediately if results are already present', async () => {
    container.innerHTML = RESULTS_FIXTURE
    const resultEl = await waitForResults(container)
    expect(resultEl).toBeInstanceOf(Element)
  })

  it('rejects with a clear error if results never appear within the timeout', async () => {
    await expect(waitForResults(container, { timeoutMs: 20 })).rejects.toThrow(
      /no MyUCSC search results appeared/i,
    )
  })
})

// getCurrentTerm's selector is unverified against the current site (see the
// ponytail note on it in myucsc.ts) -- these tests just pin its current,
// known-unverified behavior rather than asserting it's correct.
describe('getCurrentTerm', () => {
  it('returns null against the real results fixture (selector does not match it)', () => {
    document.body.innerHTML = RESULTS_FIXTURE
    expect(getCurrentTerm(document)).toBeNull()
  })

  it('returns null when the page has no term element', () => {
    document.body.innerHTML = '<p>not a MyUCSC page</p>'
    expect(getCurrentTerm(document)).toBeNull()
  })
})
