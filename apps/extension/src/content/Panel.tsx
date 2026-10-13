import { useEffect, useMemo, useState } from 'react'
import { computeGESlots } from '../ge-tracker/geProgress'
import { loadCatalog } from '../prereq-graph/catalogSnapshot'
import { usePlans, useSettings, useTakenCourses } from '../storage/hooks'

// Persistent GE-progress widget shown on every matched MyUCSC page (see
// content/index.tsx) so a student sees satisfied/open GEs without opening
// the standalone GE tracker tab. Positioned bottom-right rather than
// SchedulePanel's top-right spot -- both are `position: fixed` at the same
// viewport corner would otherwise stack on top of each other on my.ucsc.edu,
// where both panels mount.
export function Panel() {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null)
  const [collapsed, setCollapsed] = useState(false)

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

  const [settings] = useSettings()
  const plans = usePlans()
  const takenCourses = useTakenCourses()

  const takenCourseCodes = useMemo(() => (takenCourses ?? []).map((t) => t.courseCode), [takenCourses])
  const plannedCourseCodes = useMemo(() => {
    const activePlan = (plans ?? []).find((p) => p.id === settings.activePlanId)
    return (activePlan?.sections ?? []).map((s) => s.courseCode)
  }, [plans, settings.activePlanId])
  const confirmedSlotIds = useMemo(() => new Set(settings.degreeProgressGECodes ?? []), [settings.degreeProgressGECodes])

  const slots = useMemo(() => {
    if (!catalog) return []
    return computeGESlots(
      {
        catalog: catalog.index,
        takenCourseCodes,
        plannedCourseCodes,
        majorCode: settings.majorCode,
        assignments: settings.geAssignments ?? undefined,
      },
      undefined,
      confirmedSlotIds,
    )
  }, [catalog, takenCourseCodes, plannedCourseCodes, settings.majorCode, settings.geAssignments, confirmedSlotIds])

  const satisfiedCount = slots.filter((s) => s.satisfied).length

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 2147483647,
        width: 240,
        borderRadius: 8,
        background: '#fff',
        border: '1px solid #ccc',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          border: 'none',
          background: '#003c6c',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span>SlugPath GEs {catalog ? `${satisfiedCount}/${slots.length}` : '…'}</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && catalog && (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {slots.map((slot) => (
            <div
              key={slot.slotId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '5px 12px',
                borderTop: '1px solid #eee',
              }}
            >
              <span>{slot.label}</span>
              <span style={{ color: slot.satisfied ? '#1a7f37' : '#999', fontWeight: 600 }}>{slot.satisfied ? '✓' : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
