import { describe, expect, it } from 'vitest'
import { parseSubjectIndexHtml, parseSubjectPageHtml } from './parse.ts'

// Verbatim from a live fetch of catalog.ucsc.edu's subject index page.
const INDEX_FIXTURE = `
<p id="breadcrumbs"><a href="/en/current/general-catalog">2026-2027 UCSC General Catalog</a> &gt; Courses</p>
<a href="/en/current/general-catalog/courses/am-applied-mathematics">AM - Applied Mathematics</a>
<a href="/en/current/general-catalog/courses/cse-computer-science-and-engineering">CSE - Computer Science and Engineering</a>
<a href="/en/current/general-catalog/courses/am-applied-mathematics">AM - Applied Mathematics</a>
<a href="/en/current/general-catalog/courses/am-applied-mathematics/lower-division">AM lower division (should be excluded)</a>
`

// Verbatim from a live fetch of .../courses/am-applied-mathematics — 3 full
// courses (normal req+GE, req-only variant, and one with crosslisted noise
// between the desc/credits blocks and the extraFields block) plus a
// dangling trailing <h2> that starts the next course, matching what a real
// page slice looks like.
const AM_FIXTURE = `<h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/lower-division/am-3"><span>AM 3</span> Precalculus for the Social Sciences</a>
</h2><div class="desc">
	<p>Introduces mathematical functions and their uses for modeling real-life problems in the social sciences. Includes inequalities, linear and quadratic equations, functions (linear, quadratic, polynomial, rational, power, exponential, logarithmic, trigonometric), inverses, and the composition of functions. Students cannot receive credit for both this course and <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/lower-division/math-3'>MATH 3</a>. STEM majors who are taking a precalculus to get into <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/lower-division/math-19a'>MATH 19A</a> need to take <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/lower-division/math-3'>MATH 3</a>.</p>
</div><div class="sc-credithours">
	<h3>
		Credits
	</h3><div class="credits">
		5
	</div>
</div><div class="desc">

</div><div class="desc">

</div><div class="extraFields">
	<h4>
		Requirements
	</h4><p>Prerequisite(s): score of 200 or higher on the  mathematics placement examination (MPE), or <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/lower-division/math-2'>MATH 2</a>.</p>
</div><div class="genEd">
	<h4>
		General Education Code
	</h4><p>MF</p>
</div><h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/lower-division/am-6"><span>AM 6</span> Precalculus for Statistics</a>
</h2><div class="desc">
	Reviews and introduces mathematical methods useful in the elementary study of statistics, including logic, real numbers, inequalities, linear and quadratic equations, functions, graphs, exponential and logarithmic functions, and summation notation. (Formerly AMS 6.)
</div><div class="sc-credithours">
	<h3>
		Credits
	</h3><div class="credits">
		5
	</div>
</div><div class="desc">

</div><div class="desc">

</div><div class="extraFields">
	<h4>
		Requirements
	</h4><p>Prerequisite(s): <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/lower-division/math-2'>MATH 2</a> or mathematics placement examination (MPE) score of 200 or higher or higher.</p>
</div><div class="genEd">
	<h4>
		General Education Code
	</h4><p>MF</p>
</div><h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/upper-division/am-107"><span>AM 107</span> Introduction to Fluid Dynamics</a>
</h2><div class="desc">
	Covers fundamental topics in fluid dynamics: Euler and Lagrange descriptions of continuum dynamics; conservation laws for inviscid and viscous flows; potential flows; exact solutions of the Navier-Stokes equation; boundary layer theory; gravity waves. Students cannot receive credit for this course and <a class='sc-courselink' href='/en/current/general-catalog/courses/am-applied-mathematics/graduate/am-217'>AM 217</a>. (<a class='sc-courselink' href='/en/current/general-catalog/courses/am-applied-mathematics/upper-division/am-107'>AM 107</a> formerly AMS 107.)
</div><div class="sc-credithours">
	<h3>
		Credits
	</h3><div class="credits">
		5
	</div>
</div><div class="desc">

</div><div class="desc">

</div><h4 class="crosslisted">
	Cross Listed Courses
</h4><p class="sc-crosslisted">PHYS 107</p><div class="extraFields">
	<h4>
		Requirements
	</h4><p>Prerequisite(s): <a class='sc-courselink' href='/en/current/general-catalog/courses/am-applied-mathematics/upper-division/am-112'>AM 112</a> or <a class='sc-courselink' href='/en/current/general-catalog/courses/math-mathematics/upper-division/math-107'>MATH 107</a> or <a class='sc-courselink' href='/en/current/general-catalog/courses/phys-physics/upper-division/phys-116c'>PHYS 116C</a> or <a class='sc-courselink' href='/en/current/general-catalog/courses/eart-earth-sciences/upper-division/eart-111'>EART 111</a>.</p>
</div><h2 class="course-name">`

// Verbatim from a live fetch of .../courses/cres-critical-race-and-ethnic-studies —
// a course with a multi-code genEd block ("CC, ER") and NO Requirements block at all.
const CRES_MULTI_GE_FIXTURE = `</div><h2 class="course-name">
		<a href="/en/current/general-catalog/courses/cres-critical-race-and-ethnic-studies/upper-division/cres-143"><span>CRES 143</span> Trans Love in a Hopeless Place</a>
	</h2><div class="desc">
		How to practice trans love in dark times? In defiance of global fascisms that trump themselves up by driving trans folks to the horizon of death or expulsion, this course dedicates time to experiments in trans* living—ranging from the formation of networks of mutual aid to pursuits of gender-bending fugitivity from captivity. Studying primarily with trans of color histories, course reflects on various arts of creating alternative worlds in which—even without many of the privileges of legal recognition—it is possible to love those whom white supremacist culture deems categorically unloveable.
	</div><div class="sc-credithours">
		<h3>
			Credits
		</h3><div class="credits">
			5
		</div>
	</div><div class="desc">

	</div><div class="desc">

	</div><div class="genEd">
		<h4>
			General Education Code
		</h4><p>CC, ER</p>
	</div><h2 class="course-name">`

// Verbatim from the same cres page — a course with NEITHER a Requirements
// block NOR a genEd block, just desc + credits (common for many courses).
const CRES_NEITHER_FIXTURE = `</div><h2 class="course-name">
		<a href="/en/current/general-catalog/courses/cres-critical-race-and-ethnic-studies/lower-division/cres-25"><span>CRES 25</span> Race / Land / Property</a>
	</h2><div class="desc">
		Provides a long historical account of the accumulation of land through logics of dispossession within the system of racial capitalism.
	</div><div class="sc-credithours">
		<h3>
			Credits
		</h3><div class="credits">
			5
		</div>
	</div><div class="desc">

	</div><div class="desc">

	</div><h2 class="course-name">`

describe('parseSubjectIndexHtml', () => {
  it('extracts unique subject slugs and the catalog version', () => {
    const { version, subjectSlugs } = parseSubjectIndexHtml(INDEX_FIXTURE)
    expect(version).toBe('2026-2027')
    expect(subjectSlugs).toEqual(['am-applied-mathematics', 'cse-computer-science-and-engineering'])
  })

  it('throws if no version can be found', () => {
    expect(() => parseSubjectIndexHtml('<a href="/en/current/general-catalog/courses/am-applied-mathematics">x</a>')).toThrow()
  })
})

describe('parseSubjectPageHtml', () => {
  it('parses every course out of a subject page, ignoring crosslisted noise and the trailing dangling header', () => {
    const courses = parseSubjectPageHtml(AM_FIXTURE)
    expect(courses).toHaveLength(3)

    expect(courses[0]).toEqual({
      code: 'AM 3',
      title: 'Precalculus for the Social Sciences',
      units: 5,
      prereqRaw:
        'Prerequisite(s): score of 200 or higher on the mathematics placement examination (MPE), or MATH 2.',
      geCodes: ['MF'],
    })

    expect(courses[1]).toEqual({
      code: 'AM 6',
      title: 'Precalculus for Statistics',
      units: 5,
      prereqRaw: 'Prerequisite(s): MATH 2 or mathematics placement examination (MPE) score of 200 or higher or higher.',
      geCodes: ['MF'],
    })

    // AM 107: crosslisted noise (<h4 class="crosslisted">) sits between the
    // desc/credits blocks and extraFields — must not confuse the parser,
    // and must not itself be picked up as prereq/geCode data.
    expect(courses[2]).toEqual({
      code: 'AM 107',
      title: 'Introduction to Fluid Dynamics',
      units: 5,
      prereqRaw:
        'Prerequisite(s): AM 112 or MATH 107 or PHYS 116C or EART 111.',
      geCodes: [],
    })
  })

  it('parses multi-code geCodes and courses with no Requirements block', () => {
    const courses = parseSubjectPageHtml(CRES_MULTI_GE_FIXTURE)
    expect(courses).toHaveLength(1)
    expect(courses[0]).toEqual({
      code: 'CRES 143',
      title: 'Trans Love in a Hopeless Place',
      units: 5,
      prereqRaw: '',
      geCodes: ['CC', 'ER'],
    })
  })

  it('handles a course with neither a Requirements block nor a genEd block', () => {
    const courses = parseSubjectPageHtml(CRES_NEITHER_FIXTURE)
    expect(courses).toHaveLength(1)
    expect(courses[0]).toEqual({
      code: 'CRES 25',
      title: 'Race / Land / Property',
      units: 5,
      prereqRaw: '',
      geCodes: [],
    })
  })

  it('ignores an extraFields block whose h4 is not "Requirements"', () => {
    const html = `<h2 class="course-name">
      <a href="/x"><span>FOO 1</span> Foo Course</a>
    </h2><div class="sc-credithours"><h3>Credits</h3><div class="credits">3</div></div>
    <div class="extraFields"><h4>Repeatable for credit</h4><p>Yes, up to 3 times.</p></div>`
    const courses = parseSubjectPageHtml(html)
    expect(courses).toHaveLength(1)
    expect(courses[0]?.prereqRaw).toBe('')
  })

  it('returns an empty array for a page with no course blocks', () => {
    expect(parseSubjectPageHtml('<p>no courses here</p>')).toEqual([])
  })
})
