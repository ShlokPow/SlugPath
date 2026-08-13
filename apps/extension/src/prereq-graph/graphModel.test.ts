import { describe, expect, it } from 'vitest'
import { createCatalogIndex, type CatalogSnapshot, type CourseSnapshot } from '@slugpath/catalog-snapshot'
// Type-only import: erased at compile time, so this doesn't require
// @slugpath/prereq-parser (built in a parallel worktree) to physically
// exist for these tests to run. It just gives the AST fixtures below the
// real shape of the contract.
import type { ParsePrereqResult, PrereqNode } from '@slugpath/prereq-parser'
import { buildPrereqGraph, normalizeCode, type CourseNodeData, type GateNodeData, type RawNodeData } from './graphModel'

function course(code: string, prereqRaw: string): CourseSnapshot {
  return { code, title: `${code} Title`, units: 5, prereqRaw, geCodes: [], termsOffered: [] }
}

const COURSES: CourseSnapshot[] = [
  course('MATH 19A', ''),
  course('MATH 19B', 'MATH 19A'),
  course('MATH 11', ''),
  course('MATH 21', 'MATH 19B and MATH 11'),
  course('CSE 12', ''),
  course('CSE 16', ''),
  course('CSE 101', 'CSE 12 or CSE 16'),
  course('CSE 30', 'gibberish that cannot be reduced to boolean course logic'),
  course('AM A', 'AM B'),
  course('AM B', 'AM C'),
  course('AM C', 'AM D'),
  course('AM D', ''),
]

const snapshot: CatalogSnapshot = { version: 'test', generatedAt: '2026-01-01T00:00:00.000Z', courses: COURSES }
const catalogIndex = createCatalogIndex(snapshot)

function ok(ast: PrereqNode): ParsePrereqResult {
  return { ok: true, ast }
}

// Fixture map standing in for the real recursive-descent parser: exact raw
// text -> expected AST, matching the ParsePrereqResult contract.
const AST_BY_RAW: Record<string, ParsePrereqResult> = {
  'MATH 19A': ok({ type: 'course', code: 'MATH 19A' }),
  'MATH 19B and MATH 11': ok({
    type: 'and',
    children: [
      { type: 'course', code: 'MATH 19B' },
      { type: 'course', code: 'MATH 11' },
    ],
  }),
  'CSE 12 or CSE 16': ok({
    type: 'or',
    children: [
      { type: 'course', code: 'CSE 12' },
      { type: 'course', code: 'CSE 16' },
    ],
  }),
  'AM B': ok({ type: 'course', code: 'AM B' }),
  'AM C': ok({ type: 'course', code: 'AM C' }),
  'AM D': ok({ type: 'course', code: 'AM D' }),
}

function parsePrereq(raw: string): ParsePrereqResult {
  return AST_BY_RAW[raw] ?? { ok: false, raw }
}

function baseParams() {
  return {
    catalogIndex,
    allCourses: COURSES,
    parsePrereq,
    plannedCodes: new Set<string>(),
    takenCodes: new Set<string>(),
  }
}

function courseData(node: { data: CourseNodeData | GateNodeData | RawNodeData }): CourseNodeData {
  if (node.data.kind !== 'course') throw new Error('expected a course node')
  return node.data
}

describe('buildPrereqGraph', () => {
  it('renders a simple linear chain (single course prereq, no gate)', () => {
    const { nodes, edges } = buildPrereqGraph({ ...baseParams(), targetCode: 'MATH 19B', direction: 'requires', depth: 2 })

    expect(nodes.map((n) => n.data.kind).sort()).toEqual(['course', 'course'])
    expect(nodes.some((n) => n.data.kind === 'course' && courseData(n).code === 'MATH 19A')).toBe(true)
    expect(nodes.some((n) => n.data.kind === 'course' && courseData(n).code === 'MATH 19B')).toBe(true)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'course:MATH19A', target: 'course:MATH19B' })

    // dagre laid out real positions
    for (const node of nodes) expect(typeof node.position.x).toBe('number')
  })

  it('creates an AND gate node for a compound "and" prereq, and recurses into each operand', () => {
    const { nodes, edges } = buildPrereqGraph({ ...baseParams(), targetCode: 'MATH 21', direction: 'requires', depth: 2 })

    const gate = nodes.find((n) => n.data.kind === 'gate')
    expect(gate?.data).toMatchObject({ kind: 'gate', op: 'AND' })

    const courseCodes = nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    // MATH 21 (root) + MATH 19B + MATH 11 (operands) + MATH 19A (MATH 19B's own prereq, level 2)
    expect(courseCodes.sort()).toEqual(['MATH 11', 'MATH 19A', 'MATH 19B', 'MATH 21'])

    expect(edges.some((e) => e.source === 'course:MATH19B' && e.target === gate?.id)).toBe(true)
    expect(edges.some((e) => e.source === 'course:MATH11' && e.target === gate?.id)).toBe(true)
    expect(edges.some((e) => e.source === gate?.id && e.target === 'course:MATH21')).toBe(true)
  })

  it('creates an OR gate node for a compound "or" prereq', () => {
    const { nodes, edges } = buildPrereqGraph({ ...baseParams(), targetCode: 'CSE 101', direction: 'requires', depth: 2 })

    const gate = nodes.find((n) => n.data.kind === 'gate')
    expect(gate?.data).toMatchObject({ kind: 'gate', op: 'OR' })

    const courseCodes = nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    expect(courseCodes.sort()).toEqual(['CSE 101', 'CSE 12', 'CSE 16'])
    expect(edges.some((e) => e.source === 'course:CSE12' && e.target === gate?.id)).toBe(true)
    expect(edges.some((e) => e.source === 'course:CSE16' && e.target === gate?.id)).toBe(true)
  })

  it('stops expanding past the requested depth (leaf-out, not error)', () => {
    const atDepth1 = buildPrereqGraph({ ...baseParams(), targetCode: 'AM A', direction: 'requires', depth: 1 })
    const codes1 = atDepth1.nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    expect(codes1.sort()).toEqual(['AM A', 'AM B'])
    expect(codes1).not.toContain('AM C')

    const atDepth2 = buildPrereqGraph({ ...baseParams(), targetCode: 'AM A', direction: 'requires', depth: 2 })
    const codes2 = atDepth2.nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    expect(codes2.sort()).toEqual(['AM A', 'AM B', 'AM C'])
    expect(codes2).not.toContain('AM D')
  })

  it('renders a raw-text fallback node when the prereq prose fails to parse', () => {
    const { nodes, edges } = buildPrereqGraph({ ...baseParams(), targetCode: 'CSE 30', direction: 'requires', depth: 2 })

    const raw = nodes.find((n) => n.data.kind === 'raw')
    expect(raw).toBeDefined()
    expect((raw?.data as RawNodeData).raw).toBe('gibberish that cannot be reduced to boolean course logic')
    expect((raw?.data as RawNodeData).hint.length).toBeGreaterThan(0)
    expect(edges.some((e) => e.source === raw?.id && e.target === 'course:CSE30')).toBe(true)
  })

  it('reverse-scans for the unlocks direction and recurses up to depth', () => {
    const { nodes, edges } = buildPrereqGraph({ ...baseParams(), targetCode: 'MATH 19A', direction: 'unlocks', depth: 2 })

    const codes = nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    // MATH 19A unlocks MATH 19B (level 1); MATH 19B in turn unlocks MATH 21 (level 2)
    expect(codes.sort()).toEqual(['MATH 19A', 'MATH 19B', 'MATH 21'])
    expect(edges.some((e) => e.source === 'course:MATH19A' && e.target === 'course:MATH19B')).toBe(true)
    expect(edges.some((e) => e.source === 'course:MATH19B' && e.target === 'course:MATH21')).toBe(true)
  })

  it('does not recurse past depth in the unlocks direction', () => {
    const { nodes } = buildPrereqGraph({ ...baseParams(), targetCode: 'MATH 19A', direction: 'unlocks', depth: 1 })
    const codes = nodes.filter((n) => n.data.kind === 'course').map((n) => courseData(n).code)
    expect(codes.sort()).toEqual(['MATH 19A', 'MATH 19B'])
    expect(codes).not.toContain('MATH 21')
  })

  it('marks planned/taken state from the injected sets', () => {
    const { nodes } = buildPrereqGraph({
      ...baseParams(),
      targetCode: 'MATH 19B',
      direction: 'requires',
      depth: 2,
      plannedCodes: new Set([normalizeCode('MATH 19B')]),
      takenCodes: new Set([normalizeCode('MATH 19A')]),
    })

    const root = nodes.find((n) => n.data.kind === 'course' && courseData(n).code === 'MATH 19B')
    const prereq = nodes.find((n) => n.data.kind === 'course' && courseData(n).code === 'MATH 19A')
    expect(courseData(root!)).toMatchObject({ planned: true, taken: false })
    expect(courseData(prereq!)).toMatchObject({ planned: false, taken: true })
  })
})
