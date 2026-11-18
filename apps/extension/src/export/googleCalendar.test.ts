import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportEventsToGoogle } from './googleCalendar'

function stubChrome(clientId: string, redirect: string) {
  const launchWebAuthFlow = vi.fn().mockResolvedValue(redirect)
  const session: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ oauth2: { client_id: clientId, scopes: ['scope-a'] } }) },
    identity: { launchWebAuthFlow, getRedirectURL: () => 'https://abc.chromiumapp.org/' },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: session[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(session, items),
        remove: async (key: string) => void delete session[key],
      },
    },
  })
  return { launchWebAuthFlow, session }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exportEventsToGoogle', () => {
  it('fails with an actionable message on the placeholder client id instead of opening sign-in', async () => {
    const { launchWebAuthFlow } = stubChrome('REPLACE_ME.apps.googleusercontent.com', '')
    await expect(exportEventsToGoogle([])).rejects.toThrow(/SLUGPATH_OAUTH_CLIENT_ID/)
    expect(launchWebAuthFlow).not.toHaveBeenCalled()
  })

  it('surfaces the error Google puts in the redirect', async () => {
    stubChrome('123.apps.googleusercontent.com', 'https://abc.chromiumapp.org/#error=access_denied')
    await expect(exportEventsToGoogle([])).rejects.toThrow(/access_denied/)
  })

  it('requests a token for the redirect URL and caches it for the next export', async () => {
    const { launchWebAuthFlow, session } = stubChrome(
      '123.apps.googleusercontent.com',
      'https://abc.chromiumapp.org/#access_token=tok&expires_in=3600',
    )
    await exportEventsToGoogle([])
    await exportEventsToGoogle([])

    expect(launchWebAuthFlow).toHaveBeenCalledTimes(1)
    const url = new URL(launchWebAuthFlow.mock.calls[0]?.[0].url)
    expect(url.searchParams.get('client_id')).toBe('123.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe('https://abc.chromiumapp.org/')
    expect(url.searchParams.get('scope')).toBe('scope-a')
    expect(session.googleToken).toMatchObject({ token: 'tok' })
  })
})
