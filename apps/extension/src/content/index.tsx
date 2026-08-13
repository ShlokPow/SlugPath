import { createRoot, type Root } from 'react-dom/client'
import { Panel } from './Panel'
import { findCourseBlocks } from '../adapters/catalog'
import { PrereqGraphPanel } from '../prereq-graph/PrereqGraphPanel'

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
