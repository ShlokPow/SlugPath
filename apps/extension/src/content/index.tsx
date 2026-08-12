import { createRoot } from 'react-dom/client'
import { Panel } from './Panel'

const host = document.createElement('div')
host.id = 'slugpath-root'
document.documentElement.appendChild(host)

const shadowRoot = host.attachShadow({ mode: 'open' })
const mountPoint = document.createElement('div')
shadowRoot.appendChild(mountPoint)

createRoot(mountPoint).render(<Panel />)
