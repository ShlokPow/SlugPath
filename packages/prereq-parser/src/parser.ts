import { tokenize, type Token } from './tokenizer'
import type { ParsePrereqResult, PrereqNode } from './types'

// A course-logic clause is often preceded by narrative ("Students who have already
// taken X should not take this course.") and/or a label. We anchor on the first
// label occurrence and parse only what follows it, since that's where the actual
// requirement logic lives in the UCSC catalog's prose convention.
const LABEL_RE = /\b(?:prerequisite\(s\)|prerequisites|prerequisite|corequisite\(s\)|corequisites|corequisite)\s*:/i

// Once we hit one of these, we've left the boolean-logic zone and entered
// enrollment-eligibility / antirequisite narrative. Both commonly mention course
// codes in passing ("...if they've completed STAT 131 and STAT 132...") that are
// NOT part of the actual requirement — parsing past this point risks folding an
// unrelated aside into the AST as if it were a real AND/OR branch. Truncating
// here is far more valuable than the rare case where real logic follows it.
const NARRATIVE_BOUNDARY_RE =
  /\benrollment\s+(?:is\s+|will\s+be\s+)?(?:restricted|limited)\b|\bis\s+restricted\s+to\b|\brestricted\s+to\b|\bstudents\s+(?:cannot|may\s+not|who\s+have\s+already)\b|\bantirequisite:/i

type SepType = 'and' | 'or'
type RawType = SepType | 'plain'

interface Range {
  start: number
  end: number
}

/**
 * A separator's type (and/or) alone doesn't tell you precedence — catalog prose
 * groups by proximity, not a fixed AND/OR binding order:
 *   "X or Y, and Z or W"   -> (X or Y) AND (Z or W)   — OR binds tighter here
 *   "X and Y, or Z and W"  -> (X and Y) OR (Z and W)  — AND binds tighter here
 * The real signal is punctuation: a comma/semicolon "attached" to a conjunction
 * marks an outer (looser) boundary; a bare keyword with no adjacent punctuation
 * binds tighter. We tier the run by attached separators first, then resolve each
 * tier's bare separators, then combine tiers — using the same AND-groups/OR-
 * within-group precedence at both levels (which is itself just the mixed-explicit
 * case of the same "outer vs inner" logic, applied once attachment already broke
 * the tie for genuinely mixed prose).
 */
interface Sep {
  type: RawType
  attached: boolean
}

function mkAnd(nodes: PrereqNode[]): PrereqNode {
  const flat: PrereqNode[] = []
  for (const n of nodes) {
    if (n.type === 'and') flat.push(...n.children)
    else flat.push(n)
  }
  return flat.length === 1 ? flat[0]! : { type: 'and', children: flat }
}

function mkOr(nodes: PrereqNode[]): PrereqNode {
  const flat: PrereqNode[] = []
  for (const n of nodes) {
    if (n.type === 'or') flat.push(...n.children)
    else flat.push(n)
  }
  return flat.length === 1 ? flat[0]! : { type: 'or', children: flat }
}

/**
 * Split a token range into chunks separated by top-level (paren-depth 0) AND/OR/
 * comma/semicolon/period tokens. A comma or semicolon immediately followed by an
 * explicit "and"/"or" keyword is absorbed into that keyword's separator (the
 * punctuation is decorative, e.g. ", or") and marks it 'attached'. A bare
 * semicolon or period (no adjacent keyword) defaults to AND, still attached
 * (catalog prose uses them to separate independent requirement clauses). A bare
 * comma with no adjacent keyword is left as 'plain' (attached) for
 * resolvePlain to figure out from its neighbors. A bare "and"/"or" keyword with
 * no adjacent punctuation at all is the only 'not attached' case — it's the
 * tighter-binding, inner-precedence separator.
 */
function splitChunks(tokens: Token[], start: number, end: number): { chunks: Range[]; seps: Sep[] } {
  const chunks: Range[] = []
  const seps: Sep[] = []
  let depth = 0
  let chunkStart = start
  let i = start
  while (i < end) {
    const t = tokens[i]!
    if (t.type === 'lparen') {
      depth++
      i++
      continue
    }
    if (t.type === 'rparen') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (depth === 0 && (t.type === 'and' || t.type === 'or' || t.type === 'comma' || t.type === 'semicolon' || t.type === 'period')) {
      chunks.push({ start: chunkStart, end: i })
      let sep: Sep
      let next = i + 1
      if (t.type === 'and' || t.type === 'or') {
        sep = { type: t.type, attached: false }
      } else {
        const following = tokens[i + 1]
        if (following && (following.type === 'and' || following.type === 'or')) {
          sep = { type: following.type, attached: true }
          next = i + 2
        } else if (t.type === 'comma') {
          sep = { type: 'plain', attached: true }
        } else {
          // ponytail: bare semicolon/period defaults to AND; a real ambiguous case
          // (e.g. an explicit "or" a few words later, past unparseable text) is an
          // accepted source of imprecision — see resolvePlain's default too.
          sep = { type: 'and', attached: true }
        }
      }
      seps.push(sep)
      chunkStart = next
      i = next
      continue
    }
    i++
  }
  chunks.push({ start: chunkStart, end })
  return { chunks, seps }
}

/** Resolve 'plain' (bare comma) separators using the nearest explicit and/or neighbor. */
function resolvePlain(seps: Sep[]): SepType[] {
  const types: RawType[] = seps.map((s) => s.type)
  let last: SepType | null = null
  for (let i = types.length - 1; i >= 0; i--) {
    const cur = types[i]!
    if (cur !== 'plain') last = cur
    else if (last) types[i] = last
  }
  let first: SepType | null = null
  for (let i = 0; i < types.length; i++) {
    const cur = types[i]!
    if (cur !== 'plain') first = cur
    else if (first) types[i] = first
    else types[i] = 'and' // ponytail: no explicit conjunction anywhere in the list; default AND.
  }
  return types as SepType[]
}

/**
 * Combine a list of leaves using AND/OR-typed separators between them, grouping
 * by AND boundaries with OR-join within each group. Whether a leaf successfully
 * "parses" is entirely up to parseLeaf — this same shape is used both for
 * chunks-within-a-tier (bare separators) and tiers-within-a-run (attached
 * separators), since both need identical precedence + drop/fail semantics:
 * a group joined by OR fails entirely if any member fails (dropping only the bad
 * branch would misrepresent the requirement as stricter than it is); a group
 * joined by AND simply drops members that fail to parse.
 */
function combineByPrecedence<T>(leaves: T[], seps: SepType[], parseLeaf: (leaf: T) => PrereqNode | null): PrereqNode | null {
  const groups: T[][] = []
  let current: T[] = [leaves[0]!]
  for (let i = 0; i < seps.length; i++) {
    if (seps[i] === 'and') {
      groups.push(current)
      current = [leaves[i + 1]!]
    } else {
      current.push(leaves[i + 1]!)
    }
  }
  groups.push(current)

  const groupNodes: PrereqNode[] = []
  for (const group of groups) {
    const items: PrereqNode[] = []
    let ok = true
    for (const leaf of group) {
      const node = parseLeaf(leaf)
      if (node === null) {
        ok = false
        break
      }
      items.push(node)
    }
    if (!ok || items.length === 0) continue
    groupNodes.push(mkOr(items))
  }

  if (groupNodes.length === 0) return null
  return mkAnd(groupNodes)
}

function findMatchingRParen(tokens: Token[], lparenIdx: number, end: number): number | null {
  let depth = 1
  for (let i = lparenIdx + 1; i < end; i++) {
    if (tokens[i]!.type === 'lparen') depth++
    else if (tokens[i]!.type === 'rparen') {
      depth--
      if (depth === 0) return i
    }
  }
  return null
}

// Words that flip a trailing clause from "required" to merely suggested. If one
// shows up in a chunk's leftover, we can't safely tolerate it as ignorable filler
// (unlike e.g. "proficiency") — silently keeping the course as a hard requirement
// would misrepresent a recommendation as mandatory, which is worse than failing.
const SOFT_QUALIFIER_RE = /^(?:recommended|suggested|preferred|encouraged|optional)$/i

function chunkHasUnsafeTrailing(tokens: Token[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const t = tokens[i]!
    if (t.type === 'course') return true
    if (t.type === 'other' && t.value && SOFT_QUALIFIER_RE.test(t.value)) return true
  }
  return false
}

/** Parse the atom starting at idx; returns the node plus the index just past it. */
function parseLeadingAtom(tokens: Token[], idx: number, end: number): { node: PrereqNode; next: number } | null {
  if (idx >= end) return null
  const t = tokens[idx]!

  if (t.type === 'lparen') {
    const match = findMatchingRParen(tokens, idx, end)
    if (match === null) return null
    const inner = parseExpr(tokens, idx + 1, match)
    if (inner === null) return null
    return { node: inner, next: match + 1 }
  }

  if (t.type === 'permission') {
    return { node: { type: 'constraint', detail: 'instructor permission', child: null }, next: idx + 1 }
  }

  if (t.type === 'placementScore') {
    return { node: { type: 'constraint', detail: `placement exam score ${t.value}+`, child: null }, next: idx + 1 }
  }

  if (t.type === 'concurrent') {
    const next = tokens[idx + 1]
    if (next?.type === 'course') {
      return { node: { type: 'constraint', detail: 'concurrent enrollment', child: { type: 'course', code: next.value! } }, next: idx + 2 }
    }
    return null
  }

  if (t.type === 'gradePre') {
    const next = tokens[idx + 1]
    if (next?.type === 'course') {
      return { node: { type: 'constraint', detail: `${t.value} or better`, child: { type: 'course', code: next.value! } }, next: idx + 2 }
    }
    return null
  }

  if (t.type === 'course') {
    let node: PrereqNode = { type: 'course', code: t.value! }
    let i = idx + 1
    while (i < end) {
      const nt = tokens[i]!
      if (nt.type === 'gradePost') {
        node = { type: 'constraint', detail: `${nt.value} or better`, child: node }
        i++
        continue
      }
      if (nt.type === 'orEquivalent') {
        node = { type: 'constraint', detail: 'or equivalent', child: node }
        i++
        continue
      }
      break
    }
    return { node, next: i }
  }

  return null
}

/**
 * Parse a single chunk as one atom. Trailing tokens after the recognized atom are
 * tolerated as ignorable filler (e.g. "or equivalent proficiency") as long as they
 * contain no further course code — if they do, we can't safely tell whether it was
 * meant to be part of the requirement, so the whole chunk fails instead of silently
 * dropping a course.
 */
function parseAtomChunk(tokens: Token[], start: number, end: number): PrereqNode | null {
  const lead = parseLeadingAtom(tokens, start, end)
  if (!lead) return null
  if (lead.next >= end) return lead.node
  if (chunkHasUnsafeTrailing(tokens, lead.next, end)) return null
  return lead.node
}

interface Tier {
  chunks: Range[]
  innerTypes: SepType[]
}

/** Split (chunks, seps) into tiers at 'attached' separator boundaries. */
function buildTiers(chunks: Range[], seps: SepType[], attached: boolean[]): { tiers: Tier[]; outerTypes: SepType[] } {
  const tiers: Tier[] = []
  const outerTypes: SepType[] = []
  let curChunks: Range[] = [chunks[0]!]
  let curInner: SepType[] = []
  for (let i = 0; i < seps.length; i++) {
    if (attached[i]) {
      tiers.push({ chunks: curChunks, innerTypes: curInner })
      outerTypes.push(seps[i]!)
      curChunks = [chunks[i + 1]!]
      curInner = []
    } else {
      curInner.push(seps[i]!)
      curChunks.push(chunks[i + 1]!)
    }
  }
  tiers.push({ chunks: curChunks, innerTypes: curInner })
  return { tiers, outerTypes }
}

/**
 * Parse a token range into an AST. Splits into tiers at punctuation-attached
 * separators (the real precedence boundary in this prose, see Sep above), then
 * combines chunks-within-a-tier and tiers-within-the-run with the same AND/OR
 * grouping + fail/drop semantics. Returns null if nothing in the range parsed.
 */
function parseExpr(tokens: Token[], start: number, end: number): PrereqNode | null {
  if (start >= end) return null
  const { chunks, seps: rawSeps } = splitChunks(tokens, start, end)
  const seps = resolvePlain(rawSeps)
  const attached = rawSeps.map((s) => s.attached)
  const { tiers, outerTypes } = buildTiers(chunks, seps, attached)

  const parseTier = (tier: Tier): PrereqNode | null => {
    if (tier.chunks.length === 1) return parseAtomChunk(tokens, tier.chunks[0]!.start, tier.chunks[0]!.end)
    return combineByPrecedence(tier.chunks, tier.innerTypes, (c) => parseAtomChunk(tokens, c.start, c.end))
  }

  if (tiers.length === 1) return parseTier(tiers[0]!)
  return combineByPrecedence(tiers, outerTypes, parseTier)
}

export function parsePrereq(raw: string): ParsePrereqResult {
  const label = LABEL_RE.exec(raw)
  let candidate = label ? raw.slice(label.index + label[0].length) : raw

  const boundary = NARRATIVE_BOUNDARY_RE.exec(candidate)
  if (boundary) candidate = candidate.slice(0, boundary.index)

  const tokens = tokenize(candidate)
  const ast = parseExpr(tokens, 0, tokens.length)
  if (ast === null) return { ok: false, raw }
  return { ok: true, ast }
}
