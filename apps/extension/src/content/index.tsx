import type { Root } from 'react-dom/client'
import { Panel } from './Panel'
import { createShadowMount } from './shadowMount'
import { injectAddToPlanButtons } from './scheduleInjection'
import { injectPrereqPopovers } from './prereqPopoverInjection'
import { findCourseBlocks } from '../adapters/catalog'
import { PrereqGraphPanel } from '../prereq-graph/PrereqGraphPanel'
import { SchedulePanel } from '../schedule/SchedulePanel'

// MyUCSC's my.ucsc.edu content script runs in every frame (manifest.config.ts
// sets all_frames: true there) because the class-search results grid isn't
// PeopleSoft-rendered at all — my.ucsc.edu's "Main Content" iframe navigates
// to a separate UCSC-built results page served from pisa.ucsc.edu, so that's
// the frame the row-button injectors actually need to run in (also listed in
// manifest.config.ts's matches). Panels must still only mount once per page,
// so UI mounting is gated on being the top frame; the injectors run in every
// frame and are a no-op wherever no results grid exists.
const isTopFrame = window.top === window

if (isTopFrame) {
  const { host: panelHost, root: panelRoot } = createShadowMount()
  document.documentElement.appendChild(panelHost)
  panelRoot.render(<Panel />)
}

if (location.hostname === 'catalog.ucsc.edu') {
  injectPrereqToggles()
}

if (location.hostname === 'my.ucsc.edu' && isTopFrame) {
  const { host: scheduleHost, root: scheduleRoot } = createShadowMount()
  scheduleHost.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;'
  document.documentElement.appendChild(scheduleHost)
  scheduleRoot.render(<SchedulePanel />)
}

if (location.hostname === 'my.ucsc.edu' || location.hostname === 'pisa.ucsc.edu') {
  void injectAddToPlanButtons(document)
  void injectPrereqPopovers(document)
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
