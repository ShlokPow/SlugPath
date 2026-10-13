/**
 * UCSC's university-wide GE requirement categories, current as of the
 * 2026-2027 General Catalog (source: catalog.ucsc.edu, "General Education
 * Requirements"). These are the same for every undergraduate regardless of
 * major — the one exception is DC, see below.
 */
export interface GERequirement {
  code: string
  name: string
  description: string
  // Requirements sharing a `group` are alternatives — satisfying ONE member
  // of the group fulfills that group's single requirement slot (e.g.
  // Perspectives: pick one of PE-E / PE-H / PE-T).
  group?: string
}

export const GE_GROUP_LABELS: Record<string, string> = {
  PE: 'Perspectives',
  PR: 'Practice',
}

export const GE_REQUIREMENTS: GERequirement[] = [
  {
    code: 'CC',
    name: 'Cross-Cultural Analysis',
    description: 'Examines cultures and societies outside the US through in-depth or comparative study.',
  },
  {
    code: 'ER',
    name: 'Ethnicity and Race',
    description: 'Examines how categories of ethnicity and race are constructed and their role in identity and inequality.',
  },
  {
    code: 'IM',
    name: 'Interpreting Arts and Media',
    description: 'Explores how information is represented by visual, auditory, or kinesthetic means.',
  },
  {
    code: 'MF',
    name: 'Mathematical and Formal Reasoning',
    description: 'University-level mathematics, computer programming, or formal logic.',
  },
  {
    code: 'SI',
    name: 'Scientific Inquiry',
    description: 'The role of observation, hypothesis, experimentation, and measurement in the physical, social, or life sciences.',
  },
  {
    code: 'SR',
    name: 'Statistical Reasoning',
    description: 'Quantitative data interpretation, statistical reasoning, and experimental design.',
  },
  {
    code: 'TA',
    name: 'Textual Analysis and Interpretation',
    description: 'Attentive, critical, and analytical reading of how texts achieve their aims.',
  },
  {
    code: 'PE-E',
    name: 'Perspectives: Environmental Awareness',
    description: 'Ecosystems, climate change, sustainability, and human-environment interactions.',
    group: 'PE',
  },
  {
    code: 'PE-H',
    name: 'Perspectives: Human Behavior',
    description: 'Individual behavior and group dynamics.',
    group: 'PE',
  },
  {
    code: 'PE-T',
    name: 'Perspectives: Technology and Society',
    description: 'Technological development and its societal impacts.',
    group: 'PE',
  },
  {
    code: 'PR-E',
    name: 'Practice: Collaborative Endeavor',
    description: 'Strategies and techniques for working effectively in groups.',
    group: 'PR',
  },
  {
    code: 'PR-C',
    name: 'Practice: Creative Process',
    description: 'Creative techniques in the arts or creative writing.',
    group: 'PR',
  },
  {
    code: 'PR-S',
    name: 'Practice: Service Learning',
    description: 'Supervised learning experience integrating classroom principles with community involvement.',
    group: 'PR',
  },
  {
    code: 'C',
    name: 'Composition',
    description: 'Writing requirement (Writing 2), taken after the Entry-Level Writing Requirement.',
  },
  {
    code: 'DC',
    name: 'Disciplinary Communication',
    description: 'One to three upper-division courses in the student’s major focused on discipline-specific communication.',
  },
]

/**
 * DC is the one GE requirement that is genuinely per-major: the catalog
 * says it's satisfied by "one to three upper-division courses required for
 * their major", not a general-catalog GE tag like the other 14 codes, so it
 * can't be looked up via CourseSnapshot.geCodes.
 *
 * ponytail: no verified per-major DC course list has been sourced yet (each
 * major publishes its own advising sheet) — keyed by Settings.majorCode, an
 * empty/missing entry means "unknown", not "no DC courses". Populate as
 * majors are verified against their real advising pages.
 */
export const DC_COURSES_BY_MAJOR: Record<string, string[]> = {}
