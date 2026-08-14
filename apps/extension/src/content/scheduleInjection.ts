// Bridges the MyUCSC adapter (apps/extension/src/adapters/myucsc.ts) to the
// schedule builder: injects an "Add to plan" button into every class-search
// result row, and re-scans on every DOM mutation so a MyUCSC re-search
// (which replaces the results table without a full page navigation) gets
// buttons too. `injectButtonsOnce` is idempotent — it skips rows that
// already carry the marker attribute — so re-scanning after our own button
// insertion, or after a real re-search, never double-injects.

import { parseSearchResults, waitForResults } from '../adapters/myucsc'
import { addSectionToPlan } from '../storage/planStore'
import type { Section } from '../storage/types'
import { useSettingsStore } from '../storage/useSettingsStore'

const INJECTED_ATTR = 'data-slugpath-add'

function sectionKeyOf(section: Section): string {
  return `${section.courseCode} ${section.sectionNumber}`
}

// Cross-listed courses and lecture+lab pairs must be picked together — a
// student can't attend the lecture without the linked component. Resolves
// `target`'s `linkedSectionKeys` against the sections found in this same
// results scan and returns the whole atomic group (target included).
export function resolveAtomicGroup(target: Section, rows: { section: Section }[]): Section[] {
  if (!target.linkedSectionKeys || target.linkedSectionKeys.length === 0) return [target]
  const wanted = new Set(target.linkedSectionKeys)
  const linked = rows.map((r) => r.section).filter((s) => wanted.has(sectionKeyOf(s)))
  return [target, ...linked]
}

async function handleAddClick(target: Section, rows: { section: Section }[]): Promise<void> {
  const { activePlanId } = useSettingsStore.getState().settings
  if (!activePlanId) {
    window.alert('SlugPath: select or create a plan in the panel first.')
    return
  }
  // Sequential, not Promise.all: addSectionToPlan is read-modify-write
  // against the same plan document, so concurrent writes for a linked group
  // would race and the last write would silently drop the others.
  for (const section of resolveAtomicGroup(target, rows)) {
    await addSectionToPlan(activePlanId, section)
  }
}

function injectButtonsOnce(root: ParentNode): void {
  const rows = parseSearchResults(root)
  for (const { section, rowEl } of rows) {
    if (rowEl.querySelector(`[${INJECTED_ATTR}]`)) continue

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(INJECTED_ATTR, 'true')
    button.textContent = 'Add to plan'
    button.style.cssText =
      'font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid #003c6c;background:#fff;color:#003c6c;cursor:pointer;'
    button.addEventListener('click', () => {
      handleAddClick(section, rows).catch((err: unknown) => console.error('SlugPath: failed to add section to plan', err))
    })

    const cell = document.createElement('td')
    cell.appendChild(button)
    rowEl.appendChild(cell)
  }
}

/**
 * Waits for the first page of MyUCSC search results, injects "Add to plan"
 * buttons, then keeps observing `root` so subsequent re-searches also get
 * buttons injected without needing a page reload.
 */
export async function injectAddToPlanButtons(root: ParentNode): Promise<void> {
  try {
    await waitForResults(root)
  } catch (err) {
    console.error('SlugPath: MyUCSC search results never loaded', err)
    return
  }

  injectButtonsOnce(root)
  const observer = new MutationObserver(() => injectButtonsOnce(root))
  observer.observe(root as unknown as Node, { childList: true, subtree: true })
}
