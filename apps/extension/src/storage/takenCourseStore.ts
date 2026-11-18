import { db } from './db'
import { normalizeCode } from '../prereq-graph/prereqText'

// One-shot writes for the self-reported taken-courses list, matching
// planStore.ts's plain-async-function convention (reads come from
// useTakenCourses()'s live query, which re-renders on these writes).
//
// Course codes are normalized on the way in via the same normalizeCode() the
// prereq popover and GE progress comparisons already use, so a hand-typed
// "cse 12" matches the catalog's "CSE 12" everywhere downstream.

export async function addTakenCourse(courseCode: string, term: string): Promise<void> {
  const code = normalizeCode(courseCode)
  if (!code) return
  await db.takenCourses.put({ courseCode: code, term: term.trim() })
}

export async function removeTakenCourse(courseCode: string): Promise<void> {
  await db.takenCourses.delete(normalizeCode(courseCode))
}
