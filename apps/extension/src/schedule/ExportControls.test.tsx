import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Plan } from '../storage/types'

const plan: Plan = { id: 'p1', name: 'Plan', term: 'Fall 2026', sections: [], createdAt: 0, updatedAt: 0 }

// ExportControls imports a zustand persist store that reads chrome.storage at
// import time, so the stub has to exist before the module is loaded.
async function renderWithClientId(clientId: string): Promise<string> {
  vi.resetModules()
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ oauth2: { client_id: clientId } }) },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  })
  const { ExportControls } = await import('./ExportControls')
  return renderToStaticMarkup(<ExportControls plan={plan} />)
}

describe('ExportControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hides the Google Calendar button when the build has no real client id', async () => {
    const html = await renderWithClientId('REPLACE_ME.apps.googleusercontent.com')
    expect(html).toContain('Download .ics')
    expect(html).not.toContain('Add to Google Calendar')
  })

  it('shows the Google Calendar button when the build has a real client id', async () => {
    const html = await renderWithClientId('123.apps.googleusercontent.com')
    expect(html).toContain('Add to Google Calendar')
  })
})
