import { describe, expect, it } from 'vitest'
import { parsePrereq } from './parser'
import type { PrereqNode } from './types'

const course = (code: string): PrereqNode => ({ type: 'course', code })

describe('parsePrereq — grammar features', () => {
  it('parses a single course', () => {
    expect(parsePrereq('Prerequisite(s): MATH 19A.')).toEqual({
      ok: true,
      ast: course('MATH 19A'),
    })
  })

  it('normalizes course code spacing/suffix into "SUBJECT NUM" form', () => {
    expect(parsePrereq('Prerequisite(s): PHYS 116C.')).toEqual({
      ok: true,
      ast: course('PHYS 116C'),
    })
  })

  it('parses an AND chain', () => {
    expect(parsePrereq('Prerequisite(s): AM 212A and AM 217.')).toEqual({
      ok: true,
      ast: { type: 'and', children: [course('AM 212A'), course('AM 217')] },
    })
  })

  it('parses an OR chain', () => {
    expect(parsePrereq('Prerequisite(s): MATH 19A or MATH 20A.')).toEqual({
      ok: true,
      ast: { type: 'or', children: [course('MATH 19A'), course('MATH 20A')] },
    })
  })

  it('parses a comma-separated OR chain with "or" repeated before every item', () => {
    expect(parsePrereq('Prerequisite(s): AM 11A, or ECON 11A, or MATH 11A.')).toEqual({
      ok: true,
      ast: { type: 'or', children: [course('AM 11A'), course('ECON 11A'), course('MATH 11A')] },
    })
  })

  it('parses an Oxford-comma AND list (conjunction only stated once, at the end)', () => {
    expect(parsePrereq('Prerequisite(s): ANTH 1, ANTH 2, and ANTH 3.')).toEqual({
      ok: true,
      ast: { type: 'and', children: [course('ANTH 1'), course('ANTH 2'), course('ANTH 3')] },
    })
  })

  it('groups OR tighter than a comma-attached AND ("X or Y, and Z or W")', () => {
    expect(parsePrereq('Prerequisite(s): MATH 19B or MATH 20B, and AM 10 or MATH 21.')).toEqual({
      ok: true,
      ast: {
        type: 'and',
        children: [
          { type: 'or', children: [course('MATH 19B'), course('MATH 20B')] },
          { type: 'or', children: [course('AM 10'), course('MATH 21')] },
        ],
      },
    })
  })

  it('groups AND tighter than a comma-attached OR ("X and Y, or Z and W")', () => {
    expect(parsePrereq('Prerequisite(s): MATH 11A and MATH 11B, or MATH 19A and MATH 19B.')).toEqual({
      ok: true,
      ast: {
        type: 'or',
        children: [
          { type: 'and', children: [course('MATH 11A'), course('MATH 11B')] },
          { type: 'and', children: [course('MATH 19A'), course('MATH 19B')] },
        ],
      },
    })
  })

  it('parses explicit parens for grouping', () => {
    expect(parsePrereq('Prerequisite(s): PHYS 133, or ECE 130L and (CSE 107 or STAT 131).')).toEqual({
      ok: true,
      ast: {
        type: 'or',
        children: [
          course('PHYS 133'),
          { type: 'and', children: [course('ECE 130L'), { type: 'or', children: [course('CSE 107'), course('STAT 131')] }] },
        ],
      },
    })
  })

  it('parses "or equivalent" as a constraint wrapping the preceding course', () => {
    expect(parsePrereq('Prerequisite(s): STAT 203 or equivalent.')).toEqual({
      ok: true,
      ast: { type: 'constraint', detail: 'or equivalent', child: course('STAT 203') },
    })
  })

  it('parses a grade minimum stated before the course ("C or better in X")', () => {
    expect(parsePrereq('Prerequisite(s): C or better in MATH 19A.')).toEqual({
      ok: true,
      ast: { type: 'constraint', detail: 'C or better', child: course('MATH 19A') },
    })
  })

  it('parses a grade minimum stated after the course ("X with a grade of C- or better")', () => {
    expect(parsePrereq('Prerequisite(s): CHEM 3A with a grade of C- or better.')).toEqual({
      ok: true,
      ast: { type: 'constraint', detail: 'C- or better', child: course('CHEM 3A') },
    })
  })

  it('parses a concurrent-enrollment marker', () => {
    expect(parsePrereq('Prerequisite(s): concurrent enrollment in STEV 96 is required.')).toEqual({
      ok: true,
      ast: { type: 'constraint', detail: 'concurrent enrollment', child: course('STEV 96') },
    })
  })

  it('parses "previous or concurrent enrollment in X"', () => {
    expect(parsePrereq('Prerequisite(s): previous or concurrent enrollment in APLX 135.')).toEqual({
      ok: true,
      ast: { type: 'constraint', detail: 'concurrent enrollment', child: course('APLX 135') },
    })
  })

  it('parses "by permission of the instructor" as a standalone constraint with no course', () => {
    expect(parsePrereq('Prerequisite(s): AM 100 or by permission of the instructor.')).toEqual({
      ok: true,
      ast: { type: 'or', children: [course('AM 100'), { type: 'constraint', detail: 'instructor permission', child: null }] },
    })
  })

  it('drops a soft "recommended" qualifier instead of treating it as a hard requirement', () => {
    expect(parsePrereq('Prerequisite(s): ANTH 1; ANTH 102A recommended.')).toEqual({
      ok: true,
      ast: course('ANTH 1'),
    })
  })

  it('truncates at the enrollment-eligibility narrative boundary rather than folding it in', () => {
    expect(
      parsePrereq('Prerequisite(s): STAT 203; or STAT 131 and STAT 132. Enrollment is restricted to graduate students; undergraduates may enroll with permission of instructor if they have completed STAT 131 and STAT 132.'),
    ).toEqual({
      ok: true,
      ast: { type: 'or', children: [course('STAT 203'), { type: 'and', children: [course('STAT 131'), course('STAT 132')] }] },
    })
  })

  it('falls back on pure narrative with no course-code logic', () => {
    const raw = 'Enrollment is restricted to graduate students.'
    expect(parsePrereq(raw)).toEqual({ ok: false, raw })
  })

  it('falls back on a cardinality quantifier ("three courses from...") rather than guessing', () => {
    const raw =
      'Prerequisite(s): Three courses from: ART 15, ART 20G, ART 20H, ART 20I, ART 20J, ART 20K, ART 20L, ART 26 or by permission of instructor. Enrollment is restricted to art majors.'
    expect(parsePrereq(raw)).toEqual({ ok: false, raw })
  })

  it('falls back on a non-course test-score alternative mixed into an OR chain', () => {
    const raw = 'Prerequisite(s): MATH 2 or mathematics placement examination (MPE) score of 200 or higher.'
    expect(parsePrereq(raw)).toEqual({ ok: false, raw })
  })

  it('preserves the ORIGINAL full raw string on fallback, not a stripped sub-clause', () => {
    const raw = 'Students who have already taken this course should not enroll. Enrollment is restricted to seniors.'
    expect(parsePrereq(raw)).toEqual({ ok: false, raw })
  })

  it('throws no special case for empty input — it naturally falls back', () => {
    expect(parsePrereq('')).toEqual({ ok: false, raw: '' })
  })

  it('resolves an unlabeled semicolon between two OR-pairs as AND (independent clauses)', () => {
    expect(parsePrereq('Prerequisite(s): AM 10 or MATH 21; MATH 19B or MATH 20B.')).toEqual({
      ok: true,
      ast: {
        type: 'and',
        children: [
          { type: 'or', children: [course('AM 10'), course('MATH 21')] },
          { type: 'or', children: [course('MATH 19B'), course('MATH 20B')] },
        ],
      },
    })
  })

  it('supports a 2-letter suffix after the course number', () => {
    expect(parsePrereq('Prerequisite(s): BIOL 129B.')).toEqual({ ok: true, ast: course('BIOL 129B') })
  })

  it('supports a subject code at the 6-letter upper bound', () => {
    // No real UCSC subject reaches 6 letters, but the contract's grammar does — pin the regex boundary directly.
    expect(parsePrereq('Prerequisite(s): ABCDEF 10.')).toEqual({ ok: true, ast: course('ABCDEF 10') })
  })
})
