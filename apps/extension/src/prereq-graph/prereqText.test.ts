import { describe, expect, it } from 'vitest'
import type { PrereqNode } from '@slugpath/prereq-parser'
import { toPrereqSegment } from './prereqText'

describe('toPrereqSegment', () => {
  it('passes a bare course through unchanged', () => {
    const ast: PrereqNode = { type: 'course', code: 'CSE 12' }
    expect(toPrereqSegment(ast)).toEqual({ kind: 'course', code: 'CSE 12' })
  })

  it('converts and/or groups recursively', () => {
    const ast: PrereqNode = {
      type: 'and',
      children: [
        { type: 'course', code: 'MATH 19B' },
        { type: 'or', children: [{ type: 'course', code: 'CSE 12' }, { type: 'course', code: 'CSE 16' }] },
      ],
    }
    expect(toPrereqSegment(ast)).toEqual({
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'course', code: 'MATH 19B' },
        {
          kind: 'group',
          op: 'OR',
          children: [
            { kind: 'course', code: 'CSE 12' },
            { kind: 'course', code: 'CSE 16' },
          ],
        },
      ],
    })
  })

  it('keeps a constraint detail alongside its underlying course', () => {
    const ast: PrereqNode = { type: 'constraint', detail: 'consent of instructor', child: { type: 'course', code: 'CSE 195' } }
    expect(toPrereqSegment(ast)).toEqual({
      kind: 'note',
      detail: 'consent of instructor',
      child: { kind: 'course', code: 'CSE 195' },
    })
  })

  it('handles a standalone constraint with no underlying course', () => {
    const ast: PrereqNode = { type: 'constraint', detail: 'consent of instructor', child: null }
    expect(toPrereqSegment(ast)).toEqual({ kind: 'note', detail: 'consent of instructor', child: null })
  })
})
