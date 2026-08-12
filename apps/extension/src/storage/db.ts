import Dexie, { type EntityTable, type Table } from 'dexie'
import type { CatalogCacheEntry, Plan, TakenCourse } from './types'

export class SlugPathDB extends Dexie {
  plans!: EntityTable<Plan, 'id'>
  takenCourses!: EntityTable<TakenCourse, 'courseCode'>
  catalogCache!: Table<CatalogCacheEntry, [string, string]>

  constructor() {
    super('slugpath')
    // Migration procedure for bumping this: see docs/migrations.md
    this.version(1).stores({
      plans: 'id, term, updatedAt',
      takenCourses: 'courseCode, term',
      catalogCache: '[courseCode+catalogYear], courseCode, fetchedAt',
    })
  }
}

export const db = new SlugPathDB()
