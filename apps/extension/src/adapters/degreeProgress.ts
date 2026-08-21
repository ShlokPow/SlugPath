// Parses the GE-requirements section of MyUCSC's "Degree Progress Report"
// (My Academics -> Degree Progress Report), a classic PeopleSoft page (real
// `submitAction_win0`/`ACE_*`/`win0div*` markup, unlike the class-search
// results grid -- see myucsc.ts's header comment for that contrast).
//
// Each of the 11 non-DC GE categories renders as a `td.PSGROUPBOXLABEL` row
// reading "GE <CODE>: <Name>" with a `<img alt="requirement satisfied">`
// next to it when satisfied -- verified 2026-08-19 against a real captured
// Degree Progress Report (see degreeProgress.test.ts). No unsatisfied
// example has been captured yet, so "satisfied" is the only confirmed
// signal; anything else (icon absent, different icon) reads as not
// satisfied rather than guessing what an unsatisfied icon looks like.
//
// DC (Disciplinary Communication) is NOT one of these rows -- it renders as
// a plain `td.PAGROUPDIVIDER` divider with no satisfied icon at all,
// because DC is genuinely satisfied per-major elsewhere on this same page
// (its own text says so: "can be found in the Upper-Division Requirements
// section for each major below"). Skipped here for the same reason
// DC_COURSES_BY_MAJOR is left unsourced in geRequirements.ts.
//
// Course-level detail (which course satisfied a category) only exists in
// the DOM once that category's row has been expanded by the user -- PeopleSoft
// loads it via a real server round-trip (`submitAction_win0`), not a CSS
// toggle, so a collapsed row's `courses` comes back empty here rather than
// this module clicking anything to force it open.

export interface DegreeProgressCourse {
  courseCode: string
  term: string
  status: 'taken' | 'planned'
}

export interface DegreeProgressGE {
  code: string
  name: string
  satisfied: boolean
  courses: DegreeProgressCourse[]
}

function normalizeCourseCode(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

function parseCourses(categoryEl: Element): DegreeProgressCourse[] {
  const courses: DegreeProgressCourse[] = []
  for (const row of categoryEl.querySelectorAll('tr[id^="trSAA_ACRSE_VW"]')) {
    const rawCode = row.querySelector('[id^="CRSE_NAME$span$"]')?.textContent ?? ''
    const courseCode = normalizeCourseCode(rawCode)
    if (!courseCode) continue
    const term = row.querySelector('[id^="CRSE_WHEN$"]')?.textContent?.trim() ?? ''
    // Only "Taken" has been seen in a real capture; any other/absent status
    // icon defaults to 'planned' rather than presuming it's actually taken.
    const statusAlt = row.querySelector('[id^="win0divCRSE_STAT$"] img')?.getAttribute('alt') ?? ''
    const status: DegreeProgressCourse['status'] = statusAlt === 'Taken' ? 'taken' : 'planned'
    courses.push({ courseCode, term, status })
  }
  return courses
}

export function parseDegreeProgressGE(root: ParentNode): DegreeProgressGE[] {
  const results: DegreeProgressGE[] = []

  for (const labelEl of root.querySelectorAll('td.PSGROUPBOXLABEL, td.PAGROUPDIVIDER')) {
    const text = (labelEl.textContent ?? '').replace(/\s+/g, ' ').trim()
    const m = /^GE\s+([\w-]+):\s*(.+)$/.exec(text)
    if (!m) continue
    const [, code = '', name = ''] = m
    if (code === 'DC') continue // handled per-major elsewhere on this page, not here

    const satisfied = labelEl.querySelector('img[alt="requirement satisfied"]') !== null
    // The course table (if the row's expanded) lives inside the same
    // "GROUPBOX3$N" wrapper as this label, further down as a sibling.
    const wrapper = labelEl.closest('[id^="win0divDERIVED_SAA_DPR_GROUPBOX3$"]') ?? labelEl
    const courses = parseCourses(wrapper)

    results.push({ code, name, satisfied, courses })
  }

  return results
}
