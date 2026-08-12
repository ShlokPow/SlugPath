import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'

afterEach(async () => {
  await Promise.all([db.plans.clear(), db.takenCourses.clear(), db.catalogCache.clear()])
})

describe('SlugPathDB', () => {
  it('stores and retrieves a plan by id', async () => {
    await db.plans.add({
      id: 'plan-1',
      name: 'Winter 2027 — plan A',
      term: 'winter-2027',
      sections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const plan = await db.plans.get('plan-1')
    expect(plan?.name).toBe('Winter 2027 — plan A')
  })

  it('keys taken courses by course code', async () => {
    await db.takenCourses.put({ courseCode: 'CSE101', term: 'fall-2025', gradeSelfReported: 'A' })

    const course = await db.takenCourses.get('CSE101')
    expect(course?.term).toBe('fall-2025')
  })

  it('keys catalog cache entries by course code + catalog year', async () => {
    await db.catalogCache.put({
      courseCode: 'CSE101',
      catalogYear: '2025-2026',
      snapshot: { title: 'Intro to CS' },
      fetchedAt: Date.now(),
    })

    const entry = await db.catalogCache.get(['CSE101', '2025-2026'])
    expect(entry?.snapshot).toEqual({ title: 'Intro to CS' })
  })
})
