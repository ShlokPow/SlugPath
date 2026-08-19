// Injects a "Prereqs" toggle button into every class-search result row on
// MyUCSC, next to the "Add to plan" button — mirrors scheduleInjection.ts's
// injection pattern (same row source, same idempotent re-scan-on-mutation
// approach). Clicking it mounts PrereqPopover for just that row's course
// directly, not the full recursive tree the catalog page's "Show prereqs"
// uses.
import type { Root } from 'react-dom/client'
import { parseSearchResults, waitForResults } from '../adapters/myucsc'
import { PrereqPopover } from '../prereq-graph/PrereqPopover'
import { createShadowMount } from './shadowMount'

const INJECTED_ATTR = 'data-slugpath-prereq'

function injectButtonsOnce(root: ParentNode): void {
  const rows = parseSearchResults(root)
  for (const { section, rowEl } of rows) {
    if (rowEl.querySelector(`[${INJECTED_ATTR}]`)) continue

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(INJECTED_ATTR, 'true')
    button.setAttribute('aria-expanded', 'false')
    button.textContent = 'Prereqs'
    button.style.cssText =
      'font-size:12px;padding:2px 8px;border-radius:6px;border:1px solid #003c6c;background:#fff;color:#003c6c;cursor:pointer;'

    let mounted: { host: HTMLDivElement; root: Root } | null = null

    button.addEventListener('click', () => {
      if (mounted) {
        mounted.root.unmount()
        mounted.host.remove()
        mounted = null
        button.setAttribute('aria-expanded', 'false')
        return
      }
      const { host, root: popoverRoot } = createShadowMount()
      host.style.cssText = 'display:block;position:relative;z-index:2147483647;'
      button.insertAdjacentElement('afterend', host)
      popoverRoot.render(<PrereqPopover courseCode={section.courseCode} />)
      mounted = { host, root: popoverRoot }
      button.setAttribute('aria-expanded', 'true')
    })

    const cell = document.createElement('td')
    cell.appendChild(button)
    rowEl.appendChild(cell)
  }
}

/**
 * Waits for the first page of MyUCSC search results, injects "Prereqs"
 * buttons, then keeps observing `root` so subsequent re-searches also get
 * buttons injected without needing a page reload.
 */
export async function injectPrereqPopovers(root: ParentNode): Promise<void> {
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
