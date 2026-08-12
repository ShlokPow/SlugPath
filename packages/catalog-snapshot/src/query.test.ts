import { describe, expect, it } from 'vitest'
import type { CatalogSnapshot } from './types'
import { createCatalogIndex } from './query'

const snapshot: CatalogSnapshot = {
  version: '2026-2027',
  generatedAt: '2026-01-01T00:00:00.000Z',
  courses: [
    { code: 'CSE 101', title: 'Algorithms', units: 5, prereqRaw: 'CSE 12', geCodes: [], termsOffered: [] },
    { code: 'CSE 30', title: 'Programming Abstractions', units: 5, prereqRaw: '', geCodes: [], termsOffered: [] },
    { code: 'AM 3', title: 'Calculus III', units: 5, prereqRaw: 'AM 2', geCodes: ['MF'], termsOffered: [] },
    { code: 'PHYS 5A', title: 'Introductory Physics I', units: 5, prereqRaw: '', geCodes: ['SI'], termsOffered: [] },
    { code: 'THEA 80G', title: 'Acting for Non-Majors', units: 5, prereqRaw: '', geCodes: ['PE-T'], termsOffered: [] },
    { code: 'KRES 1', title: 'Introduction to Kinesiology', units: 2, prereqRaw: '', geCodes: ['PE-H'], termsOffered: [] },
    { code: 'CRES 10', title: 'Intro to Critical Race Studies', units: 5, prereqRaw: '', geCodes: ['CC', 'ER'], termsOffered: [] },
  ],
}

describe('createCatalogIndex', () => {
  const index = createCatalogIndex(snapshot)

  describe('getCourse', () => {
    it('finds a course by exact code', () => {
      expect(index.getCourse('CSE 101')?.title).toBe('Algorithms')
    })

    it('finds a course by lowercase code', () => {
      expect(index.getCourse('cse 101')?.title).toBe('Algorithms')
    })

    it('finds a course regardless of internal whitespace', () => {
      expect(index.getCourse('cse101')?.title).toBe('Algorithms')
      expect(index.getCourse('cse  101')?.title).toBe('Algorithms')
      expect(index.getCourse(' CSE 101 ')?.title).toBe('Algorithms')
    })

    it('returns undefined for an unknown code', () => {
      expect(index.getCourse('CSE 999')).toBeUndefined()
    })
  })

  describe('search', () => {
    it('matches a substring of the title, case-insensitively', () => {
      const results = index.search('algo')
      expect(results.map((c) => c.code)).toEqual(['CSE 101'])
    })

    it('matches a substring of the code, case-insensitively', () => {
      const results = index.search('am 3')
      expect(results.map((c) => c.code)).toEqual(['AM 3'])
    })

    it('returns an empty array when nothing matches', () => {
      expect(index.search('nonexistent query')).toEqual([])
    })
  })

  describe('coursesSatisfying', () => {
    it('returns all courses whose geCodes include the given code', () => {
      const results = index.coursesSatisfying('CC')
      expect(results.map((c) => c.code)).toEqual(['CRES 10'])
    })

    it('matches case-insensitively', () => {
      const results = index.coursesSatisfying('pe-t')
      expect(results.map((c) => c.code)).toEqual(['THEA 80G'])
    })

    it('returns an empty array when no course satisfies the GE code', () => {
      expect(index.coursesSatisfying('IM')).toEqual([])
    })

    it('does not substring-match a different geCode (PE-T must not match PE-H)', () => {
      const results = index.coursesSatisfying('PE-T')
      expect(results.map((c) => c.code)).toEqual(['THEA 80G'])
      expect(results.map((c) => c.code)).not.toContain('KRES 1')
    })
  })
})
