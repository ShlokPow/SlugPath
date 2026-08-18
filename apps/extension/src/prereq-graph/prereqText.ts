// Pure AST -> display-tree transform for the direct-prereqs-only popover.
// Kept separate from PrereqPopover.tsx (same split as graphModel.ts vs
// PrereqGraphPanel.tsx) so the AND/OR/constraint-unwrapping logic is
// unit-testable without rendering React.
import type { PrereqNode } from '@slugpath/prereq-parser'

export type PrereqSegment =
  | { kind: 'course'; code: string }
  | { kind: 'group'; op: 'AND' | 'OR'; children: PrereqSegment[] }
  | { kind: 'note'; detail: string; child: PrereqSegment | null }

export function toPrereqSegment(node: PrereqNode): PrereqSegment {
  if (node.type === 'course') return { kind: 'course', code: node.code }
  if (node.type === 'and' || node.type === 'or') {
    return { kind: 'group', op: node.type === 'and' ? 'AND' : 'OR', children: node.children.map(toPrereqSegment) }
  }
  return { kind: 'note', detail: node.detail, child: node.child ? toPrereqSegment(node.child) : null }
}
