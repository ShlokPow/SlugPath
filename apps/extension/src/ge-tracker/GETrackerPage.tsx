import { useEffect, useMemo, useState } from 'react'
import { loadCatalog } from '../prereq-graph/catalogSnapshot'
import { usePlans, useSettings, useTakenCourses } from '../storage/hooks'
import { applyGEAssignment, computeGEProgress, computeGESlots, findMultiGECourses, type GESlot } from './geProgress'

export function GETrackerPage() {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadCatalog>> | null>(null)

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

  const [settings, setSettings] = useSettings()
  const plans = usePlans()
  const takenCourses = useTakenCourses()

  const takenCourseCodes = useMemo(() => (takenCourses ?? []).map((t) => t.courseCode), [takenCourses])
  const plannedCourseCodes = useMemo(() => {
    const activePlan = (plans ?? []).find((p) => p.id === settings.activePlanId)
    return (activePlan?.sections ?? []).map((s) => s.courseCode)
  }, [plans, settings.activePlanId])

  const confirmedSlotIds = useMemo(
    () => new Set(settings.degreeProgressGECodes ?? []),
    [settings.degreeProgressGECodes],
  )

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

  // Multi-GE eligibility is computed WITHOUT assignments applied: once a course
  // is assigned, it only credits one GE, which would otherwise make it look
  // single-GE and hide the very picker used to change or clear the assignment.
  const multiGECourses = useMemo(() => {
    if (!catalog) return new Map<string, string[]>()
    const rawProgress = computeGEProgress({
      catalog: catalog.index,
      takenCourseCodes,
      plannedCourseCodes,
      majorCode: settings.majorCode,
    })
    return findMultiGECourses(rawProgress)
  }, [catalog, takenCourseCodes, plannedCourseCodes, settings.majorCode])

  function assign(courseCode: string, geCode: string) {
    setSettings({ geAssignments: applyGEAssignment(settings.geAssignments, courseCode, geCode) })
  }

  if (!catalog) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <p>Loading…</p>
      </main>
    )
  }

  const satisfiedCount = slots.filter((s) => s.satisfied).length

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720 }}>
      <h1>GE Tracker</h1>
      <p style={{ fontSize: 18, fontWeight: 600 }}>
        {satisfiedCount} of {slots.length} GEs satisfied
      </p>

      {multiGECourses.size > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15 }}>Double-counted courses</h2>
          <p style={{ fontSize: 13, color: '#555' }}>
            These courses count toward more than one GE. Pick a primary GE to count it toward only that one, or leave it
            counting toward all of them.
          </p>
          {[...multiGECourses.entries()].map(([courseCode, geCodes]) => (
            <div key={courseCode} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 600, marginRight: 8 }}>{courseCode}</span>
              <select value={settings.geAssignments?.[courseCode] ?? ''} onChange={(e) => assign(courseCode, e.target.value)}>
                <option value="">Count toward all ({geCodes.join(', ')})</option>
                {geCodes.map((code) => (
                  <option key={code} value={code}>
                    {code} only
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}

      <section>
        {slots.map((slot) => (
          <SlotRow key={slot.slotId} slot={slot} />
        ))}
      </section>
    </main>
  )
}

function SlotRow({ slot }: { slot: GESlot }) {
  const hasCreditedCourse = slot.options.some((opt) => opt.creditedBy.length > 0)
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>{slot.label}</span>
        <span style={{ color: slot.satisfied ? '#1a7f37' : '#999' }}>{slot.satisfied ? 'Satisfied' : 'Open'}</span>
      </div>
      {slot.options.map(
        (opt) =>
          opt.creditedBy.length > 0 && (
            <div key={opt.code} style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
              {opt.name}: {opt.creditedBy.map((c) => `${c.courseCode} (${c.status})`).join(', ')}
            </div>
          ),
      )}
      {/* Satisfied via an imported Degree Progress Report row that was collapsed
          at import time, so there's no specific course to show (see
          adapters/degreeProgress.ts) -- not the same as "no data at all". */}
      {slot.satisfied && !hasCreditedCourse && (
        <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Confirmed by Degree Progress Report</div>
      )}
    </div>
  )
}
