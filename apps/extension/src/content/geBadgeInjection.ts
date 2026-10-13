// Injects small GE-requirement badges into every class-search result row on
// MyUCSC -- mirrors scheduleInjection.ts/prereqPopoverInjection.tsx's
// injection pattern (same row source, same idempotent re-scan-on-mutation
// approach). A badge for a GE code the student already has covered (via a
// taken or actively-planned course, per computeGEProgress) renders filled
// instead of outlined, so double-dipping is visible at a glance.
import type { CatalogIndex } from '@slugpath/catalog-snapshot'
import { parseSearchResults, waitForResults } from '../adapters/myucsc'
import { computeGEProgress } from '../ge-tracker/geProgress'
import { loadCatalog } from '../prereq-graph/catalogSnapshot'
import { db } from '../storage/db'
import { useSettingsStore } from '../storage/useSettingsStore'

const INJECTED_ATTR = 'data-slugpath-ge'
const COVERED_ATTR = 'data-slugpath-ge-covered'

function badgeStyle(covered: boolean): string {
  const base = 'display:inline-block;margin:0 2px;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:600;'
  return covered ? `${base}background:#003c6c;color:#fff;border:1px solid #003c6c;` : `${base}background:#fff;color:#003c6c;border:1px solid #003c6c;`
}

async function satisfiedGECodes(index: CatalogIndex): Promise<Set<string>> {
  const [takenCourses, plans] = await Promise.all([db.takenCourses.toArray(), db.plans.toArray()])
  const { majorCode, activePlanId } = useSettingsStore.getState().settings
  const activePlan = plans.find((p) => p.id === activePlanId)

  const progress = computeGEProgress({
    catalog: index,
    takenCourseCodes: takenCourses.map((t) => t.courseCode),
    plannedCourseCodes: activePlan?.sections.map((s) => s.courseCode) ?? [],
    majorCode,
  })
  return new Set(progress.filter((p) => p.satisfied).map((p) => p.code))
}

async function injectBadgesOnce(root: ParentNode, index: CatalogIndex): Promise<void> {
  const rows = parseSearchResults(root)
  const pending = rows.filter(({ rowEl }) => !rowEl.querySelector(`[${INJECTED_ATTR}]`))
  if (pending.length === 0) return

  const covered = await satisfiedGECodes(index)

  for (const { section, rowEl } of pending) {
    if (rowEl.querySelector(`[${INJECTED_ATTR}]`)) continue // re-scan may have already handled this row

    const geCodes = index.getCourse(section.courseCode)?.geCodes ?? []
    if (geCodes.length === 0) continue

    const cell = document.createElement('td')
    cell.setAttribute(INJECTED_ATTR, 'true')
    for (const code of geCodes) {
      const isCovered = covered.has(code)
      const badge = document.createElement('span')
      badge.textContent = code
      badge.title = isCovered ? `${code} — already covered by a taken or planned course` : code
      badge.setAttribute(COVERED_ATTR, String(isCovered))
      badge.style.cssText = badgeStyle(isCovered)
      cell.appendChild(badge)
    }
    rowEl.appendChild(cell)
  }
}

/**
 * Waits for the first page of MyUCSC search results, injects GE badges, then
 * keeps observing `root` so subsequent re-searches also get badges without
 * needing a page reload.
 */
export async function injectGEBadges(root: ParentNode): Promise<void> {
  try {
    await waitForResults(root)
  } catch (err) {
    console.error('SlugPath: MyUCSC search results never loaded', err)
    return
  }

  let index: CatalogIndex
  try {
    index = (await loadCatalog()).index
  } catch (err) {
    console.error('SlugPath: failed to load catalog snapshot for GE badges', err)
    return
  }

  const run = () => {
    injectBadgesOnce(root, index).catch((err: unknown) => console.error('SlugPath: failed to inject GE badges', err))
  }
  await injectBadgesOnce(root, index)
  const observer = new MutationObserver(run)
  observer.observe(root as unknown as Node, { childList: true, subtree: true })
}
