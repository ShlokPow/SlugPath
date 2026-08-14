import { describe, expect, it } from 'vitest'
import { findConflicts, sectionKey, sectionsConflict } from './conflicts'
import type { Section } from '../storage/types'

function section(overrides: Partial<Section> & Pick<Section, 'courseCode' | 'sectionNumber'>): Section {
  return {
    meetingPattern: [],
    instructor: 'Staff',
    seatsOpen: 10,
    ...overrides,
  }
}

describe('sectionKey', () => {
  it('joins courseCode and sectionNumber with a space', () => {
    expect(sectionKey(section({ courseCode: 'CSE101', sectionNumber: '01' }))).toBe('CSE101 01')
  })
})

describe('sectionsConflict', () => {
  it('conflicts when same-day time ranges overlap', () => {
    const a = section({
      courseCode: 'CSE101',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'X' }],
    })
    const b = section({
      courseCode: 'CSE102',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 630, endMinute: 690, location: 'Y' }],
    })
    expect(sectionsConflict(a, b)).toBe(true)
  })

  it('does not conflict when same-day ranges are adjacent (end === start)', () => {
    const a = section({
      courseCode: 'CSE101',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'X' }],
    })
    const b = section({
      courseCode: 'CSE102',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 660, endMinute: 720, location: 'Y' }],
    })
    expect(sectionsConflict(a, b)).toBe(false)
  })

  it('does not conflict on different days even if times overlap', () => {
    const a = section({
      courseCode: 'CSE101',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'X' }],
    })
    const b = section({
      courseCode: 'CSE102',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Tue'], startMinute: 600, endMinute: 660, location: 'Y' }],
    })
    expect(sectionsConflict(a, b)).toBe(false)
  })

  it('does not conflict when sections are linked, even with overlapping times', () => {
    const a = section({
      courseCode: 'CSE101',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'X' }],
      linkedSectionKeys: ['CSE101L 01'],
    })
    const b = section({
      courseCode: 'CSE101L',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'Y' }],
    })
    expect(sectionsConflict(a, b)).toBe(false)
  })
})

describe('findConflicts', () => {
  it('returns exactly the one conflicting pair among three sections', () => {
    const a = section({
      courseCode: 'CSE101',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 600, endMinute: 660, location: 'X' }],
    })
    const b = section({
      courseCode: 'CSE102',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Mon'], startMinute: 630, endMinute: 690, location: 'Y' }],
    })
    const c = section({
      courseCode: 'CSE103',
      sectionNumber: '01',
      meetingPattern: [{ days: ['Wed'], startMinute: 900, endMinute: 960, location: 'Z' }],
    })

    const conflicts = findConflicts([a, b, c])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toEqual({ a, b })
  })
})
