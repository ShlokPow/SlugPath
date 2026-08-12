import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useSettingsStore } from './useSettingsStore'
import type { Plan, Settings, TakenCourse } from './types'

export function usePlans(): Plan[] | undefined {
  return useLiveQuery(() => db.plans.toArray(), [])
}

export function useTakenCourses(): TakenCourse[] | undefined {
  return useLiveQuery(() => db.takenCourses.toArray(), [])
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  return [settings, setSettings]
}
