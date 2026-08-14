import { useMemo, type CSSProperties } from 'react'
import { usePlans, useSettings } from '../storage/hooks'
import { addSectionToPlan as _addSectionToPlan, createPlan, deletePlan, duplicatePlan, removeSectionFromPlan, renamePlan } from '../storage/planStore'
import type { Plan, Section } from '../storage/types'
import { findConflicts, sectionKey } from './conflicts'

// re-exported so callers integrating "Add to plan" buttons elsewhere don't
// need to reach into storage/planStore directly.
export const addSectionToPlan = _addSectionToPlan

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const GRID_START_MINUTE = 7 * 60
const GRID_END_MINUTE = 22 * 60
const PIXELS_PER_MINUTE = 0.6
const GRID_HEIGHT = (GRID_END_MINUTE - GRID_START_MINUTE) * PIXELS_PER_MINUTE

export function SchedulePanel() {
  const [settings, setSettings] = useSettings()
  const plans = usePlans()

  const activePlan = useMemo(() => plans?.find((p) => p.id === settings.activePlanId), [plans, settings.activePlanId])

  async function handleCreatePlan() {
    const name = window.prompt('Plan name?')
    if (!name) return
    const id = await createPlan(name, settings.defaultTerm ?? '')
    setSettings({ activePlanId: id })
  }

  async function handleRename() {
    if (!activePlan) return
    const name = window.prompt('New plan name?', activePlan.name)
    if (!name) return
    await renamePlan(activePlan.id, name)
  }

  async function handleDuplicate() {
    if (!activePlan) return
    const name = window.prompt('Name for the duplicate?', `${activePlan.name} copy`)
    if (!name) return
    const id = await duplicatePlan(activePlan.id, name)
    setSettings({ activePlanId: id })
  }

  async function handleDelete() {
    if (!activePlan) return
    if (!window.confirm(`Delete "${activePlan.name}"? This cannot be undone.`)) return
    await deletePlan(activePlan.id)
    const remaining = plans?.filter((p) => p.id !== activePlan.id) ?? []
    setSettings({ activePlanId: remaining[0]?.id ?? null })
  }

  return (
    <div style={panelStyle}>
      <PlanSwitcher
        plans={plans ?? []}
        activePlanId={settings.activePlanId}
        onSwitch={(id) => setSettings({ activePlanId: id })}
        onCreate={handleCreatePlan}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        hasActivePlan={Boolean(activePlan)}
      />
      {activePlan ? <ActivePlanView plan={activePlan} /> : <EmptyState onCreate={handleCreatePlan} />}
    </div>
  )
}

function PlanSwitcher(props: {
  plans: Plan[]
  activePlanId: string | null
  onSwitch: (id: string | null) => void
  onCreate: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  hasActivePlan: boolean
}) {
  const { plans, activePlanId, onSwitch, onCreate, onRename, onDuplicate, onDelete, hasActivePlan } = props
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #ddd', fontSize: 12 }}>
      <select
        value={activePlanId ?? ''}
        onChange={(e) => onSwitch(e.target.value || null)}
        style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #003c6c', color: '#003c6c' }}
      >
        <option value="">Select a plan…</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={onCreate} style={buttonStyle}>
        + New plan
      </button>
      {hasActivePlan && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button type="button" onClick={onRename} style={buttonStyle} title="Rename plan">
            Rename
          </button>
          <button type="button" onClick={onDuplicate} style={buttonStyle} title="Duplicate plan">
            Duplicate
          </button>
          <button type="button" onClick={onDelete} style={{ ...buttonStyle, borderColor: '#a33', color: '#a33' }} title="Delete plan">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ padding: 20, fontSize: 13, color: '#555', textAlign: 'center' }}>
      <p>No plan selected yet.</p>
      <button type="button" onClick={onCreate} style={buttonStyle}>
        Create your first plan
      </button>
    </div>
  )
}

function ActivePlanView({ plan }: { plan: Plan }) {
  const conflicts = useMemo(() => findConflicts(plan.sections), [plan.sections])

  const conflictPartners = useMemo(() => {
    const map = new Map<string, Section[]>()
    for (const { a, b } of conflicts) {
      const keyA = sectionKey(a)
      const keyB = sectionKey(b)
      map.set(keyA, [...(map.get(keyA) ?? []), b])
      map.set(keyB, [...(map.get(keyB) ?? []), a])
    }
    return map
  }, [conflicts])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PickedSectionsList plan={plan} conflictPartners={conflictPartners} />
      <WeeklyGrid sections={plan.sections} conflictPartners={conflictPartners} />
    </div>
  )
}

function PickedSectionsList({ plan, conflictPartners }: { plan: Plan; conflictPartners: Map<string, Section[]> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Section[]>()
    for (const section of plan.sections) {
      const list = map.get(section.courseCode) ?? []
      list.push(section)
      map.set(section.courseCode, list)
    }
    return map
  }, [plan.sections])

  if (plan.sections.length === 0) {
    return <div style={{ padding: 10, fontSize: 12, color: '#777' }}>No sections picked yet.</div>
  }

  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid #ddd', maxHeight: 160, overflowY: 'auto' }}>
      {[...grouped.entries()].map(([courseCode, sections]) => (
        <div key={courseCode} style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#003c6c' }}>{courseCode}</div>
          {sections.map((section) => {
            const key = sectionKey(section)
            const inConflict = conflictPartners.has(key)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '2px 0 2px 10px' }}>
                <span style={{ color: inConflict ? '#a33' : '#333' }}>
                  {section.sectionNumber} — {section.instructor}
                </span>
                {section.linkedSectionKeys && section.linkedSectionKeys.length > 0 && (
                  <span style={linkedBadgeStyle} title={`Linked with ${section.linkedSectionKeys.join(', ')}`}>
                    linked
                  </span>
                )}
                <button type="button" onClick={() => removeSectionFromPlan(plan.id, key)} style={{ ...buttonStyle, padding: '1px 6px', marginLeft: 'auto' }}>
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function WeeklyGrid({ sections, conflictPartners }: { sections: Section[]; conflictPartners: Map<string, Section[]> }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {DAYS.map((day) => (
          <div key={day} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#003c6c' }}>
            {day}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, position: 'relative', height: GRID_HEIGHT, border: '1px solid #ddd', borderRadius: 6 }}>
        {DAYS.map((day) => (
          <div key={day} style={{ flex: 1, position: 'relative', borderLeft: '1px solid #eee' }}>
            {sections.flatMap((section) =>
              section.meetingPattern
                .filter((pattern) => pattern.days.includes(day))
                .map((pattern, i) => {
                  const key = sectionKey(section)
                  const partners = conflictPartners.get(key)
                  const top = Math.max(0, (pattern.startMinute - GRID_START_MINUTE) * PIXELS_PER_MINUTE)
                  const height = Math.max(2, (pattern.endMinute - pattern.startMinute) * PIXELS_PER_MINUTE)
                  return (
                    <div
                      key={`${key}-${day}-${i}`}
                      // title attribute is the spec's required hover tooltip — no
                      // extra tooltip component needed for a native affordance.
                      title={partners ? `Conflicts with ${partners.map((p) => sectionKey(p)).join(', ')}` : `${section.courseCode} ${section.sectionNumber}`}
                      style={{
                        position: 'absolute',
                        top,
                        height,
                        left: 2,
                        right: 2,
                        borderRadius: 4,
                        fontSize: 10,
                        padding: 2,
                        overflow: 'hidden',
                        background: partners ? '#f8d7da' : '#e6eef5',
                        border: `1px solid ${partners ? '#a33' : '#003c6c'}`,
                        color: partners ? '#a33' : '#003c6c',
                      }}
                    >
                      {section.courseCode} {section.sectionNumber}
                    </div>
                  )
                }),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const panelStyle: CSSProperties = {
  width: 320,
  height: 480,
  border: '1px solid #ccc',
  borderRadius: 8,
  background: '#fafafa',
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
}

const buttonStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid #003c6c',
  background: '#fff',
  color: '#003c6c',
  cursor: 'pointer',
  fontSize: 11,
}

const linkedBadgeStyle: CSSProperties = {
  fontSize: 9,
  background: '#e6eef5',
  color: '#003c6c',
  padding: '1px 4px',
  borderRadius: 4,
}
