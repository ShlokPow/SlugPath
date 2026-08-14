import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addSectionToPlan, createPlan, deletePlan, duplicatePlan, removeSectionFromPlan, renamePlan } from './planStore'
import type { Section } from './types'

afterEach(async () => {
  await Promise.all([db.plans.clear(), db.takenCourses.clear(), db.catalogCache.clear()])
})

function section(overrides: Partial<Section> & Pick<Section, 'courseCode' | 'sectionNumber'>): Section {
  return { meetingPattern: [], instructor: 'Staff', seatsOpen: 10, ...overrides }
}

describe('planStore', () => {
  it('creates a plan with empty sections', async () => {
    const id = await createPlan('Fall plan', 'fall-2025')
    const plan = await db.plans.get(id)
    expect(plan).toMatchObject({ id, name: 'Fall plan', term: 'fall-2025', sections: [] })
  })

  it('renames a plan and bumps updatedAt', async () => {
    const id = await createPlan('Original', 'fall-2025')
    const before = await db.plans.get(id)

    await new Promise((r) => setTimeout(r, 2))
    await renamePlan(id, 'Renamed')

    const after = await db.plans.get(id)
    expect(after?.name).toBe('Renamed')
    expect(after!.updatedAt).toBeGreaterThan(before!.updatedAt)
  })

  it('deletes a plan', async () => {
    const id = await createPlan('Gone soon', 'fall-2025')
    await deletePlan(id)
    expect(await db.plans.get(id)).toBeUndefined()
  })

  it('duplicates a plan with a new id and name, preserving sections', async () => {
    const id = await createPlan('Original', 'fall-2025')
    await addSectionToPlan(id, section({ courseCode: 'CSE101', sectionNumber: '01' }))

    const newId = await duplicatePlan(id, 'Copy of Original')
    expect(newId).not.toBe(id)

    const copy = await db.plans.get(newId)
    expect(copy?.name).toBe('Copy of Original')
    expect(copy?.sections).toHaveLength(1)
    expect(copy?.sections[0]?.courseCode).toBe('CSE101')

    // original untouched
    const original = await db.plans.get(id)
    expect(original?.sections).toHaveLength(1)
  })

  it('addSectionToPlan appends to the right plan and bumps updatedAt', async () => {
    const id = await createPlan('Plan A', 'fall-2025')
    const before = await db.plans.get(id)

    await new Promise((r) => setTimeout(r, 2))
    await addSectionToPlan(id, section({ courseCode: 'CSE101', sectionNumber: '01' }))

    const after = await db.plans.get(id)
    expect(after?.sections).toHaveLength(1)
    expect(after!.updatedAt).toBeGreaterThan(before!.updatedAt)
  })

  it('addSectionToPlan replaces an existing section with the same key', async () => {
    const id = await createPlan('Plan A', 'fall-2025')
    await addSectionToPlan(id, section({ courseCode: 'CSE101', sectionNumber: '01', seatsOpen: 5 }))
    await addSectionToPlan(id, section({ courseCode: 'CSE101', sectionNumber: '01', seatsOpen: 0 }))

    const plan = await db.plans.get(id)
    expect(plan?.sections).toHaveLength(1)
    expect(plan?.sections[0]?.seatsOpen).toBe(0)
  })

  it('removeSectionFromPlan removes only the matching section and bumps updatedAt', async () => {
    const id = await createPlan('Plan A', 'fall-2025')
    await addSectionToPlan(id, section({ courseCode: 'CSE101', sectionNumber: '01' }))
    await addSectionToPlan(id, section({ courseCode: 'CSE102', sectionNumber: '01' }))
    const before = await db.plans.get(id)

    await new Promise((r) => setTimeout(r, 2))
    await removeSectionFromPlan(id, 'CSE101 01')

    const after = await db.plans.get(id)
    expect(after?.sections).toHaveLength(1)
    expect(after?.sections[0]?.courseCode).toBe('CSE102')
    expect(after!.updatedAt).toBeGreaterThan(before!.updatedAt)
  })
})
