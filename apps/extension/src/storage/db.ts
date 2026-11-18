import type { Plan, TakenCourse } from './types'

// chrome.storage.local, not IndexedDB: a content script's IndexedDB belongs to
// the *page's* origin, so the my.ucsc.edu panel, the pisa.ucsc.edu results
// iframe and the extension pages (options, GE tracker) each had a separate
// database and couldn't see each other's plans. chrome.storage.local is the one
// store every extension context shares, and onChanged gives live updates.
//
// ponytail: each collection is one key rewritten whole on every write — fine for
// a handful of plans (quota is 10MB); concurrent writes from two contexts are
// last-write-wins. Per-item keys if that ever bites.
export class Collection<T> {
  constructor(
    readonly storageKey: string,
    private readonly keyOf: (item: T) => string,
  ) {}

  static values<T>(raw: unknown): T[] {
    return Object.values((raw as Record<string, T> | undefined) ?? {})
  }

  private async all(): Promise<Record<string, T>> {
    const result = await chrome.storage.local.get(this.storageKey)
    return (result[this.storageKey] as Record<string, T> | undefined) ?? {}
  }

  private async save(items: Record<string, T>): Promise<void> {
    await chrome.storage.local.set({ [this.storageKey]: items })
  }

  async toArray(): Promise<T[]> {
    return Object.values(await this.all())
  }

  async get(key: string): Promise<T | undefined> {
    return (await this.all())[key]
  }

  async put(item: T): Promise<void> {
    const items = await this.all()
    items[this.keyOf(item)] = item
    await this.save(items)
  }

  add = this.put

  async update(key: string, patch: Partial<T>): Promise<void> {
    const items = await this.all()
    const item = items[key]
    if (!item) return
    items[key] = { ...item, ...patch }
    await this.save(items)
  }

  async delete(key: string): Promise<void> {
    const items = await this.all()
    delete items[key]
    await this.save(items)
  }

  async clear(): Promise<void> {
    await this.save({})
  }
}

export const db = {
  plans: new Collection<Plan>('plans', (p) => p.id),
  takenCourses: new Collection<TakenCourse>('takenCourses', (t) => t.courseCode),
}
