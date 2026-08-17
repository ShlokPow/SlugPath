// Pure logic: AST + catalog data -> React Flow node/edge model with a dagre
// layout applied. No React here — keeps this fully unit-testable.
//
// `parsePrereq` is taken as an injected parameter (not imported directly)
// so this module — and its tests — don't require @slugpath/prereq-parser to
// be physically present. The real package is built in a parallel worktree;
// PrereqGraphPanel.tsx wires the real `parsePrereq` in.
import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@xyflow/react'
import type { CatalogIndex, CourseSnapshot } from '@slugpath/catalog-snapshot'
import type { ParsePrereqResult, PrereqNode } from '@slugpath/prereq-parser'

export type Direction = 'requires' | 'unlocks'

// `type` (not `interface`) so these keep the implicit index signature that
// lets them satisfy @xyflow/react's `Node<T extends Record<string, unknown>>`
// constraint — interfaces don't get that inference.
export type CourseNodeData = {
  kind: 'course'
  code: string
  title: string
  geCodes: string[]
  planned: boolean
  taken: boolean
  // Undefined for courses scraped before this field existed, or for a code
  // mentioned in prereq prose that isn't in the catalog at all.
  sourceUrl?: string
}

export type GateNodeData = {
  kind: 'gate'
  op: 'AND' | 'OR'
}

export type RawNodeData = {
  kind: 'raw'
  raw: string
  hint: string
}

export type PrereqNodeData = CourseNodeData | GateNodeData | RawNodeData
export type PrereqFlowNode = Node<PrereqNodeData>
export type PrereqFlowEdge = Edge<{ detail?: string }>

export interface BuildPrereqGraphParams {
  targetCode: string
  direction: Direction
  /** 1-4 */
  depth: number
  catalogIndex: CatalogIndex
  /** Full course list — needed for the `unlocks` reverse scan; CatalogIndex has no reverse lookup. */
  allCourses: CourseSnapshot[]
  parsePrereq: (raw: string) => ParsePrereqResult
  plannedCodes: Set<string>
  takenCodes: Set<string>
}

// Course height must cover the worst case rendered by CourseNode: code + title +
// wrapped GE-code badges + taken/planned label. 64 was sized for the bare
// code+title case only, so dagre packed rows too tightly and any course with
// GE codes (or a taken/planned tag) overlapped the rank below it.
const NODE_SIZE: Record<PrereqNodeData['kind'], { width: number; height: number }> = {
  course: { width: 200, height: 96 },
  gate: { width: 64, height: 36 },
  raw: { width: 220, height: 80 },
}

export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase()
}

function courseNodeId(code: string): string {
  return `course:${normalizeCode(code)}`
}

interface BuildCtx {
  catalogIndex: CatalogIndex
  allCourses: CourseSnapshot[]
  parsePrereq: (raw: string) => ParsePrereqResult
  plannedCodes: Set<string>
  takenCodes: Set<string>
  depth: number
  nodes: PrereqFlowNode[]
  edges: PrereqFlowEdge[]
  seenNodeIds: Set<string>
  counter: number
}

function nextId(ctx: BuildCtx, prefix: string): string {
  ctx.counter += 1
  return `${prefix}:${ctx.counter}`
}

function makeCourseNode(ctx: BuildCtx, code: string): PrereqFlowNode {
  const id = courseNodeId(code)
  const course = ctx.catalogIndex.getCourse(code)
  const normalized = normalizeCode(code)
  const data: CourseNodeData = {
    kind: 'course',
    code: course?.code ?? code,
    title: course?.title ?? code,
    geCodes: course?.geCodes ?? [],
    planned: ctx.plannedCodes.has(normalized),
    taken: ctx.takenCodes.has(normalized),
    sourceUrl: course?.sourceUrl,
  }
  return { id, position: { x: 0, y: 0 }, data, type: 'course' }
}

function addNodeOnce(ctx: BuildCtx, node: PrereqFlowNode): void {
  if (ctx.seenNodeIds.has(node.id)) return
  ctx.seenNodeIds.add(node.id)
  ctx.nodes.push(node)
}

function addEdge(ctx: BuildCtx, source: string, target: string, detail?: string): void {
  const id = `edge:${source}->${target}`
  if (ctx.edges.some((e) => e.id === id)) return
  ctx.edges.push({ id, source, target, data: detail ? { detail } : undefined, label: detail })
}

/** Unwraps transparent `constraint` nodes, collecting their `detail` strings along the way. */
function unwrapConstraints(node: PrereqNode): { node: PrereqNode | null; details: string[] } {
  if (node.type !== 'constraint') return { node, details: [] }
  if (!node.child) return { node: null, details: [node.detail] }
  const inner = unwrapConstraints(node.child)
  return { node: inner.node, details: [node.detail, ...inner.details] }
}

function astContainsCourse(node: PrereqNode, code: string): boolean {
  if (node.type === 'course') return normalizeCode(node.code) === normalizeCode(code)
  if (node.type === 'and' || node.type === 'or') return node.children.some((c: PrereqNode) => astContainsCourse(c, code))
  return node.child ? astContainsCourse(node.child, code) : false
}

/** Expands one course's own prereqs (level = depth of `code` itself, 0 for the graph root). */
function expandRequiresCourse(ctx: BuildCtx, code: string, level: number): string {
  const nodeId = courseNodeId(code)
  if (ctx.seenNodeIds.has(nodeId)) return nodeId
  addNodeOnce(ctx, makeCourseNode(ctx, code))

  const course = ctx.catalogIndex.getCourse(code)
  if (!course?.prereqRaw || level >= ctx.depth) return nodeId

  const result = ctx.parsePrereq(course.prereqRaw)
  if (!result.ok) {
    const rawId = nextId(ctx, 'raw')
    addNodeOnce(ctx, {
      id: rawId,
      position: { x: 0, y: 0 },
      type: 'raw',
      data: { kind: 'raw', raw: result.raw, hint: "Couldn't parse this requirement automatically" },
    })
    addEdge(ctx, rawId, nodeId)
    return nodeId
  }

  expandRequiresAst(ctx, result.ast, nodeId, level)
  return nodeId
}

/** Wires the AST of `parentId`'s prereqs into the graph. `parentLevel` is parentId's own depth level. */
function expandRequiresAst(ctx: BuildCtx, ast: PrereqNode, parentId: string, parentLevel: number): void {
  const { node, details } = unwrapConstraints(ast)
  const detail = details.length ? details.join('; ') : undefined

  if (!node) {
    // Constraint with no underlying course (e.g. a standalone "consent of instructor")
    const rawId = nextId(ctx, 'raw')
    addNodeOnce(ctx, {
      id: rawId,
      position: { x: 0, y: 0 },
      type: 'raw',
      data: { kind: 'raw', raw: detail ?? '', hint: 'Additional requirement (no associated course)' },
    })
    addEdge(ctx, rawId, parentId)
    return
  }

  if (node.type === 'course') {
    const childId = expandRequiresCourse(ctx, node.code, parentLevel + 1)
    addEdge(ctx, childId, parentId, detail)
    return
  }

  if (node.type === 'and' || node.type === 'or') {
    const gateId = nextId(ctx, 'gate')
    addNodeOnce(ctx, {
      id: gateId,
      position: { x: 0, y: 0 },
      type: 'gate',
      data: { kind: 'gate', op: node.type === 'and' ? 'AND' : 'OR' },
    })
    addEdge(ctx, gateId, parentId, detail)
    for (const child of node.children) {
      expandRequiresAst(ctx, child, gateId, parentLevel)
    }
    return
  }

  // node.type === 'constraint' can't reach here — unwrapConstraints already stripped it.
}

function courseListsAsPrereqOf(ctx: BuildCtx, course: CourseSnapshot, targetCode: string): boolean {
  if (!course.prereqRaw) return false
  const result = ctx.parsePrereq(course.prereqRaw)
  return result.ok && astContainsCourse(result.ast, targetCode)
}

function expandUnlocks(ctx: BuildCtx, code: string, nodeId: string, level: number): void {
  if (level >= ctx.depth) return
  for (const course of ctx.allCourses) {
    if (!courseListsAsPrereqOf(ctx, course, code)) continue
    const childId = courseNodeId(course.code)
    addNodeOnce(ctx, makeCourseNode(ctx, course.code))
    addEdge(ctx, nodeId, childId)
    expandUnlocks(ctx, course.code, childId, level + 1)
  }
}

function layout(nodes: PrereqFlowNode[], edges: PrereqFlowEdge[]): PrereqFlowNode[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const size = NODE_SIZE[node.data.kind]
    g.setNode(node.id, size)
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }
  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id) as { x: number; y: number } | undefined
    const size = NODE_SIZE[node.data.kind]
    if (!pos) return node
    return { ...node, position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 } }
  })
}

export function buildPrereqGraph(params: BuildPrereqGraphParams): { nodes: PrereqFlowNode[]; edges: PrereqFlowEdge[] } {
  const depth = Math.min(4, Math.max(1, params.depth))
  const ctx: BuildCtx = {
    catalogIndex: params.catalogIndex,
    allCourses: params.allCourses,
    parsePrereq: params.parsePrereq,
    plannedCodes: params.plannedCodes,
    takenCodes: params.takenCodes,
    depth,
    nodes: [],
    edges: [],
    seenNodeIds: new Set(),
    counter: 0,
  }

  const rootId = courseNodeId(params.targetCode)
  addNodeOnce(ctx, makeCourseNode(ctx, params.targetCode))

  if (params.direction === 'requires') {
    const course = ctx.catalogIndex.getCourse(params.targetCode)
    if (course?.prereqRaw) {
      const result = ctx.parsePrereq(course.prereqRaw)
      if (!result.ok) {
        const rawId = nextId(ctx, 'raw')
        addNodeOnce(ctx, {
          id: rawId,
          position: { x: 0, y: 0 },
          type: 'raw',
          data: { kind: 'raw', raw: result.raw, hint: "Couldn't parse this requirement automatically" },
        })
        addEdge(ctx, rawId, rootId)
      } else {
        expandRequiresAst(ctx, result.ast, rootId, 0)
      }
    }
  } else {
    expandUnlocks(ctx, params.targetCode, rootId, 0)
  }

  return { nodes: layout(ctx.nodes, ctx.edges), edges: ctx.edges }
}
