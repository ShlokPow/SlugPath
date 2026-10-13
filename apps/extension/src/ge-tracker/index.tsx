import { createRoot } from 'react-dom/client'
import { GETrackerPage } from './GETrackerPage'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

createRoot(root).render(<GETrackerPage />)
