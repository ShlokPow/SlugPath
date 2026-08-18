import { createRoot, type Root } from 'react-dom/client'

// One host <div> + shadow root per mount point, per the isolation pattern
// used throughout content-script UI: prevents page styles leaking in and
// Tailwind/inline styles leaking out.
export function createShadowMount(): { host: HTMLDivElement; root: Root } {
  const host = document.createElement('div')
  const shadowRoot = host.attachShadow({ mode: 'open' })
  const mountPoint = document.createElement('div')
  shadowRoot.appendChild(mountPoint)
  return { host, root: createRoot(mountPoint) }
}
