import { createRoot, type Root } from 'react-dom/client'
import { Panel } from './Panel'
import { findCourseBlocks } from '../adapters/catalog'
import { parseSearchResults, waitForResults } from '../adapters/myucsc'
import { PrereqGraphPanel } from '../prereq-graph/PrereqGraphPanel'
import { addSectionToPlan, SchedulePanel } from '../schedule/SchedulePanel'
import { useSettingsStore } from '../storage/useSettingsStore'

// One host <div> + shadow root per mount point, per the isolation pattern
// used throughout content-script UI: prevents page styles leaking in and
// Tailwind/inline styles leaking out.
function createShadowMount(): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div')
  const shadowRoot = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadowRoot.appendChild(mountPoint)
  return { host, root: createRoot(mountPoint) }
}

const { host: panelHost, root: panelRoot } = createShadowMount()
document.documentElement.appendChild(panelHost)
panelRoot.render(<Panel />)

if (location.hostname === 'catalog.ucsc.edu') {
  injectPrereqToggles()
}

if (location.hostname === 'my.ucsc.edu') {
  const { host: scheduleHost, root: scheduleRoot } = createShadowMount()
  scheduleHost.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;'
  document.documentElement.appendChild(scheduleHost)
  scheduleRoot.render(<SchedulePanel />)

  void injectAddToPlanButtons()
}

/**
 * Adds a "Show prereqs" toggle next to every course heading on a catalog
 * subject page. The graph itself is only mounted on click (lazily) — a
 * subject page can list 50+ courses, so eagerly mounting a React Flow graph
 * per course would be wasteful.
 */
function injectPrereqToggles(): void {
  for (const block of findCourseBlocks(document)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Show prereqs'
    button.setAttribute('aria-expanded', 'false')
    button.style.cssText =
      'margin-left:8px;font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid #003c6c;background:#fff;color:#003c6c;cursor:pointer;'
    block.headingEl.insertAdjacentElement('afterend', button)

    let mounted: { host: HTMLDivElement; root: Root } | null = null

    button.addEventListener('click', () => {
      if (mounted) {
        mounted.root.unmount()
        mounted.host.remove()
        mounted = null
        button.textContent = 'Show prereqs'
        button.setAttribute('aria-expanded', 'false')
        return
      }
      const { host, root } = createShadowMount()
      host.style.cssText = 'display:block;margin:8px 0;'
      button.insertAdjacentElement('afterend', host)
      root.render(<PrereqGraphPanel targetCode={block.code} />)
      mounted = { host, root }
      button.textContent = 'Hide prereqs'
      button.setAttribute('aria-expanded', 'true')
    })
  }
}

/**
 * Adds an "Add to plan" button to every MyUCSC class-search result row once
 * results have loaded. Only runs once per page load — MyUCSC re-searches by
 * reloading the results panel, which this content script doesn't currently
 * re-observe after the first pass (a search-panel MutationObserver to
 * re-inject on every new search is a reasonable follow-up).
 */
async function injectAddToPlanButtons(): Promise<void> {
  try {
    await waitForResults(document)
  } catch (err) {
    console.error('SlugPath: MyUCSC search results never loaded', err)
    return
  }

  for (const { section, rowEl } of parseSearchResults(document)) {
    if (rowEl.querySelector('[data-slugpath-add]')) continue // already injected

    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.slugpathAdd = 'true'
    button.textContent = 'Add to plan'
    button.style.cssText =
      'font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid #003c6c;background:#fff;color:#003c6c;cursor:pointer;'

    button.addEventListener('click', () => {
      const { activePlanId } = useSettingsStore.getState().settings
      if (!activePlanId) {
        window.alert('SlugPath: select or create a plan in the panel first.')
        return
      }
      addSectionToPlan(activePlanId, section).catch((err: unknown) =>
        console.error('SlugPath: failed to add section to plan', err),
      )
    })

    const cell = document.createElement('td')
    cell.appendChild(button)
    rowEl.appendChild(cell)
  }
}
