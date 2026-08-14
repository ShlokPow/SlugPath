// Every catalog.ucsc.edu DOM selector lives in this one file — mirrors the
// MyUCSC adapter pattern (see V1_FEATURES_AND_TECH.md) so a catalog DOM
// change is a single-file fix.
//
// Real shape (see scripts/catalog/parse.test.ts for verbatim fixtures):
//   <h2 class="course-name"><a href="...course url..."><span>CODE</span> Title</a></h2>
// followed by sibling <div class="desc">, <div class="sc-credithours">, etc.
// A subject page lists many of these headings; we only need the heading
// itself (as the injection anchor) and the code out of its <span>.

export interface CourseBlock {
  code: string
  headingEl: Element
}

export function findCourseBlocks(root: ParentNode): CourseBlock[] {
  const blocks: CourseBlock[] = []
  for (const heading of root.querySelectorAll('h2.course-name')) {
    const code = heading.querySelector('a > span')?.textContent?.trim()
    if (code) blocks.push({ code, headingEl: heading })
  }
  return blocks
}
