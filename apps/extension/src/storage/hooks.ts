import { useEffect, useState } from 'react'
import { Collection, db } from './db'
import { useSettingsStore } from './useSettingsStore'
import type { Plan, Settings, TakenCourse } from './types'

// Live view of a collection: initial read, then chrome.storage.onChanged pushes
// every write from any context (panel, results iframe, extension pages).
function useCollection<T>(collection: Collection<T>): T[] | undefined {
  const [items, setItems] = useState<T[]>()
  useEffect(() => {
    // `fresh` stops a slow initial read from clobbering a newer onChanged value.
    let fresh = true
    void collection.toArray().then((all) => fresh && setItems(all))
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const change = changes[collection.storageKey]
      if (area !== 'local' || !change) return
      fresh = false
      setItems(Collection.values<T>(change.newValue))
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      fresh = false
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [collection])
  return items
}

export function usePlans(): Plan[] | undefined {
  return useCollection(db.plans)
}

export function useTakenCourses(): TakenCourse[] | undefined {
  return useCollection(db.takenCourses)
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSettingsStore((state) => state.settings)
  const setSettings = useSettingsStore((state) => state.setSettings)
  return [settings, setSettings]
}
