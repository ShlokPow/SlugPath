import { db } from './db'
import type { Plan, Section } from './types'
import { sectionKey } from '../schedule/conflicts'

// Plain async functions, not hooks — these are one-shot writes. Reads stay in
// hooks.ts via usePlans()'s useLiveQuery, which re-renders automatically once
// these functions touch db.plans.

export async function createPlan(name: string, term: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const plan: Plan = { id, name, term, sections: [], createdAt: now, updatedAt: now }
  await db.plans.add(plan)
  return id
}

export async function renamePlan(id: string, name: string): Promise<void> {
  await db.plans.update(id, { name, updatedAt: Date.now() })
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.delete(id)
}

export async function duplicatePlan(id: string, newName: string): Promise<string> {
  const source = await db.plans.get(id)
  if (!source) throw new Error(`SlugPath: cannot duplicate unknown plan ${id}`)

  const newId = crypto.randomUUID()
  const now = Date.now()
  const plan: Plan = { ...source, id: newId, name: newName, createdAt: now, updatedAt: now }
  await db.plans.add(plan)
  return newId
}

export async function addSectionToPlan(planId: string, section: Section): Promise<void> {
  const plan = await db.plans.get(planId)
  if (!plan) throw new Error(`SlugPath: cannot add section to unknown plan ${planId}`)

  const key = sectionKey(section)
  const sections = [...plan.sections.filter((s) => sectionKey(s) !== key), section]
  await db.plans.update(planId, { sections, updatedAt: Date.now() })
}

export async function removeSectionFromPlan(planId: string, sectionKeyToRemove: string): Promise<void> {
  const plan = await db.plans.get(planId)
  if (!plan) throw new Error(`SlugPath: cannot remove section from unknown plan ${planId}`)

  const sections = plan.sections.filter((s) => sectionKey(s) !== sectionKeyToRemove)
  await db.plans.update(planId, { sections, updatedAt: Date.now() })
}
