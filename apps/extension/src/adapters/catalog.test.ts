// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { findCourseBlocks } from './catalog'

// Verbatim from a live fetch of .../courses/am-applied-mathematics — same
// fixture the scraper's parser is tested against (scripts/catalog/parse.test.ts),
// reused here to prove the content-script adapter finds the same real course
// blocks in an actual DOM, not just a synthetic one.
const AM_FIXTURE = `<h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/lower-division/am-3"><span>AM 3</span> Precalculus for the Social Sciences</a>
</h2><div class="desc">
	<p>Introduces mathematical functions and their uses for modeling real-life problems in the social sciences.</p>
</div><div class="sc-credithours">
	<h3>Credits</h3><div class="credits">5</div>
</div><div class="extraFields">
	<h4>Requirements</h4><p>Prerequisite(s): score of 200 or higher on the mathematics placement examination (MPE), or MATH 2.</p>
</div><div class="genEd">
	<h4>General Education Code</h4><p>MF</p>
</div><h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/lower-division/am-6"><span>AM 6</span> Precalculus for Statistics</a>
</h2><div class="desc">
	Reviews and introduces mathematical methods useful in the elementary study of statistics.
</div><div class="sc-credithours">
	<h3>Credits</h3><div class="credits">5</div>
</div><div class="extraFields">
	<h4>Requirements</h4><p>Prerequisite(s): MATH 2 or mathematics placement examination (MPE) score of 200 or higher or higher.</p>
</div><h2 class="course-name">
	<a href="/en/current/general-catalog/courses/am-applied-mathematics/upper-division/am-107"><span>AM 107</span> Introduction to Fluid Dynamics</a>
</h2><div class="desc">
	Covers fundamental topics in fluid dynamics.
</div>`

describe('findCourseBlocks (real DOM, happy-dom)', () => {
  it('finds every course heading and its code in a real subject-page fixture', () => {
    document.body.innerHTML = AM_FIXTURE
    const blocks = findCourseBlocks(document)

    expect(blocks.map((b) => b.code)).toEqual(['AM 3', 'AM 6', 'AM 107'])
    for (const block of blocks) {
      expect(block.headingEl.tagName).toBe('H2')
      expect(block.headingEl.classList.contains('course-name')).toBe(true)
    }
  })

  it('injecting a button after the heading (the real content-script wiring) lands it next to the right course', () => {
    document.body.innerHTML = AM_FIXTURE
    const [first] = findCourseBlocks(document)
    if (!first) throw new Error('expected at least one course block')

    const button = document.createElement('button')
    button.textContent = 'Show prereqs'
    first.headingEl.insertAdjacentElement('afterend', button)

    expect(first.headingEl.nextElementSibling).toBe(button)
  })

  it('returns an empty array when the page has no course blocks', () => {
    document.body.innerHTML = '<p>not a catalog page</p>'
    expect(findCourseBlocks(document)).toEqual([])
  })
})
