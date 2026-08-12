import { createRoot } from 'react-dom/client'
import { Options } from './Options'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

createRoot(root).render(<Options />)
