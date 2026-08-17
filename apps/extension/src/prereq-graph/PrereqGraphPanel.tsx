import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react'
import xyflowStyles from '@xyflow/react/dist/style.css?inline'
import type { CatalogIndex, CatalogSnapshot } from '@slugpath/catalog-snapshot'
import { parsePrereq } from '@slugpath/prereq-parser'
import { usePlans, useTakenCourses } from '../storage/hooks'
import { loadCatalog } from './catalogSnapshot'
import { buildPrereqGraph, normalizeCode, type Direction, type PrereqFlowNode } from './graphModel'

const nodeTypes: NodeTypes = { course: CourseNode, gate: GateNode, raw: RawNode }

export function PrereqGraphPanel({ targetCode }: { targetCode: string }) {
  const [direction, setDirection] = useState<Direction>('requires')
  const [depth, setDepth] = useState(2)
  const [catalog, setCatalog] = useState<{ index: CatalogIndex; snapshot: CatalogSnapshot } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c)
      })
      .catch((err: unknown) => console.error('SlugPath: failed to load catalog snapshot', err))
    return () => {
      cancelled = true
    }
  }, [])

  const plans = usePlans()
  const takenCourses = useTakenCourses()

  const plannedCodes = useMemo(() => {
    const set = new Set<string>()
    for (const plan of plans ?? []) {
      for (const section of plan.sections) set.add(normalizeCode(section.courseCode))
    }
    return set
  }, [plans])

  const takenCodes = useMemo(() => {
    const set = new Set<string>()
    for (const taken of takenCourses ?? []) set.add(normalizeCode(taken.courseCode))
    return set
  }, [takenCourses])

  const graph = useMemo(() => {
    if (!catalog) return null
    return buildPrereqGraph({
      targetCode,
      direction,
      depth,
      catalogIndex: catalog.index,
      allCourses: catalog.snapshot.courses,
      parsePrereq,
      plannedCodes,
      takenCodes,
    })
  }, [catalog, targetCode, direction, depth, plannedCodes, takenCodes])

  return (
    <div
      style={{
        width: 640,
        height: 460,
        border: '1px solid #ccc',
        borderRadius: 8,
        background: '#fafafa',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{xyflowStyles}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: '1px solid #ddd',
          fontSize: 12,
        }}
      >
        <button type="button" onClick={() => setDirection('requires')} aria-pressed={direction === 'requires'} style={toggleStyle(direction === 'requires')}>
          Requires
        </button>
        <button type="button" onClick={() => setDirection('unlocks')} aria-pressed={direction === 'unlocks'} style={toggleStyle(direction === 'unlocks')}>
          Unlocks
        </button>
        <span style={{ marginLeft: 'auto' }}>Depth</span>
        <button type="button" aria-label="Decrease depth" onClick={() => setDepth((d) => Math.max(1, d - 1))} disabled={depth <= 1}>
          −
        </button>
        <span>{depth}</span>
        <button type="button" aria-label="Increase depth" onClick={() => setDepth((d) => Math.min(4, d + 1))} disabled={depth >= 4}>
          +
        </button>
      </div>
      <div style={{ flex: 1 }}>
        {graph ? (
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            fitView
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div style={{ padding: 16, fontSize: 13 }}>Loading catalog…</div>
        )}
      </div>
    </div>
  )
}

function toggleStyle(active: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #003c6c',
    background: active ? '#003c6c' : '#fff',
    color: active ? '#fff' : '#003c6c',
    cursor: 'pointer',
    fontSize: 12,
  }
}

function CourseNode({ data: course }: NodeProps<PrereqFlowNode>) {
  if (course.kind !== 'course') return null
  const clickable = Boolean(course.sourceUrl)
  return (
    <div
      onClick={clickable ? () => window.open(course.sourceUrl, '_blank', 'noopener,noreferrer') : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={course.title}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid #003c6c',
        background: course.taken ? '#d7f5dd' : course.planned ? '#fff3cd' : '#fff',
        cursor: clickable ? 'pointer' : 'default',
        fontSize: 12,
        width: 190,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600 }}>{course.code}</div>
      <div style={{ fontSize: 11, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{course.title}</div>
      {course.geCodes.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {course.geCodes.map((ge) => (
            <span key={ge} style={{ fontSize: 10, background: '#e6eef5', padding: '1px 4px', borderRadius: 4 }}>
              {ge}
            </span>
          ))}
        </div>
      )}
      {(course.planned || course.taken) && (
        <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600 }}>{course.taken ? 'Taken' : 'Planned'}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function GateNode({ data }: NodeProps<PrereqFlowNode>) {
  if (data.kind !== 'gate') return null
  return (
    <div
      style={{
        width: 56,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: '1px solid #666',
        background: '#eee',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <Handle type="target" position={Position.Top} />
      {data.op}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

function RawNode({ data }: NodeProps<PrereqFlowNode>) {
  if (data.kind !== 'raw') return null
  return (
    <div
      title={data.hint}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px dashed #999',
        background: '#f5f5f5',
        fontSize: 11,
        width: 200,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontStyle: 'italic', color: '#555' }}>{data.hint}</div>
      <div style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {data.raw}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
