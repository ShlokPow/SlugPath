// Injects an "Import GE completions" button next to the GENERAL EDUCATION
// REQUIREMENTS header on MyUCSC's Degree Progress Report (My Academics ->
// Degree Progress Report). See adapters/degreeProgress.ts's header comment
// for how that page's markup works and what "satisfied, no course" means.

import { parseDegreeProgressGE } from '../adapters/degreeProgress'
import { db } from '../storage/db'
import { useSettingsStore } from '../storage/useSettingsStore'

const INJECTED_ATTR = 'data-slugpath-dpr-import'

function findSectionHeader(root: ParentNode): Element | null {
  for (const el of root.querySelectorAll('td.PSGROUPBOXLABEL')) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.startsWith('GENERAL EDUCATION REQUIREMENTS')) return el
  }
  return null
}

async function handleImport(root: ParentNode, button: HTMLButtonElement): Promise<void> {
  const categories = parseDegreeProgressGE(root)
  const satisfiedCodes = categories.filter((c) => c.satisfied).map((c) => c.code)

  // Only a confirmed 'taken' status gets written to takenCourses -- no real
  // capture of any other status exists yet (see degreeProgress.ts), and
  // there's nowhere to put a "planned per DPR" course anyway: this
  // extension's "planned" means "in a Plan's sections", which needs a
  // specific MyUCSC section DPR doesn't expose.
  for (const category of categories) {
    for (const course of category.courses) {
      if (course.status !== 'taken') continue
      await db.takenCourses.put({ courseCode: course.courseCode, term: course.term })
    }
  }

  useSettingsStore.getState().setSettings({
    degreeProgressGECodes: satisfiedCodes,
    degreeProgressImportedAt: Date.now(),
  })

  button.textContent = `Imported ${satisfiedCodes.length} satisfied GEs`
}

function injectButtonOnce(root: ParentNode): void {
  const header = findSectionHeader(root)
  if (!header || header.querySelector(`[${INJECTED_ATTR}]`)) return

  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(INJECTED_ATTR, 'true')
  button.textContent = 'Import GE completions'
  button.style.cssText =
    'font-size:12px;padding:2px 8px;margin-left:8px;border-radius:6px;border:1px solid #fdc700;background:#003c6c;color:#fdc700;cursor:pointer;'
  button.addEventListener('click', () => {
    handleImport(root, button).catch((err: unknown) => {
      console.error('SlugPath: failed to import Degree Progress Report GE data', err)
      button.textContent = 'Import failed — see console'
    })
  })
  header.appendChild(button)
}

// No waitFor/timeout here (unlike scheduleInjection.ts's waitForResults):
// there's no captured evidence this page loads its GE section
// asynchronously the way MyUCSC's class-search iframe does, so this just
// tries immediately and lets the MutationObserver catch it if the section
// renders later after all.
export function injectDegreeProgressImport(root: ParentNode): void {
  injectButtonOnce(root)
  const observer = new MutationObserver(() => injectButtonOnce(root))
  observer.observe(root as unknown as Node, { childList: true, subtree: true })
}
