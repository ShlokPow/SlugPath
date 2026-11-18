import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { installChromeStorageMock } from './testChromeMock'

beforeEach(() => installChromeStorageMock())

describe('db', () => {
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
    await db.takenCourses.put({ courseCode: 'CSE101', term: 'winter-2026' })

    expect(await db.takenCourses.toArray()).toEqual([{ courseCode: 'CSE101', term: 'winter-2026' }])
  })

  it('updates and deletes by key', async () => {
    await db.takenCourses.put({ courseCode: 'CSE101', term: 'fall-2025' })
    await db.takenCourses.update('CSE101', { gradeSelfReported: 'B' })
    expect((await db.takenCourses.get('CSE101'))?.gradeSelfReported).toBe('B')

    await db.takenCourses.delete('CSE101')
    expect(await db.takenCourses.get('CSE101')).toBeUndefined()
  })
})
