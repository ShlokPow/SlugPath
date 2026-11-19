// Google Calendar export. Runs in the background service worker only:
// chrome.identity isn't exposed to content scripts, so the SchedulePanel
// (a content script) reaches this through the messages in messages.ts rather
// than calling it directly.

import { toRfc3339, UCSC_TIME_ZONE, type CalendarEvent } from './events'

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export interface ExportResult {
  created: number
  // `index` is the position in the `events` array passed in, so a retry can
  // re-send exactly the ones that failed rather than the whole plan again
  // (POSTing an already-created event duplicates it — there's no upsert).
  failed: Array<{ index: number; summary: string; error: string }>
}

const TOKEN_KEY = 'googleToken'

// A build without SLUGPATH_OAUTH_CLIENT_ID ships manifest.config.ts's
// placeholder; Google's own error for that is an opaque "invalid_client".
export function googleConfigured(): boolean {
  const id = chrome.runtime.getManifest().oauth2?.client_id
  return !!id && !id.startsWith('REPLACE_ME')
}

function clientId(): string {
  const id = chrome.runtime.getManifest().oauth2?.client_id ?? ''
  if (!googleConfigured()) {
    throw new Error(
      'Google sign-in is not configured in this build: set SLUGPATH_OAUTH_CLIENT_ID to a Google Cloud OAuth client id (Web application type) and rebuild. Use "Download .ics" instead.',
    )
  }
  return id
}

// launchWebAuthFlow, not chrome.identity.getAuthToken: Google rejects
// getAuthToken for unverified Chrome-extension OAuth clients ("Custom URI
// scheme is not supported on Chrome apps"), and non-Chrome Chromium browsers
// don't implement it at all. The client must be a "Web application" with
// chrome.identity.getRedirectURL() as an authorized redirect URI.
// ponytail: implicit flow, no refresh token — the user re-consents (usually a
// single click) once the ~1h token expires.
async function authToken(interactive: boolean): Promise<string> {
  const id = clientId()
  const cached = (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] as { token: string; expiresAt: number } | undefined
  if (cached && cached.expiresAt > Date.now()) return cached.token
  if (!interactive) throw new Error('Not signed in to Google')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: id,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: chrome.runtime.getManifest().oauth2?.scopes?.join(' ') ?? '',
  }).toString()
  // Rejects with chrome.runtime.lastError's message when the user closes the
  // window or Google returns an error page.
  const redirect = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true })
  const params = new URLSearchParams(new URL(redirect ?? '').hash.slice(1))
  const token = params.get('access_token')
  if (!token) throw new Error(`Google sign-in failed: ${params.get('error') ?? 'no token returned'}`)
  // Expire a minute early so a token never dies mid-export.
  const expiresAt = Date.now() + (Number(params.get('expires_in') ?? 3600) - 60) * 1000
  await chrome.storage.session.set({ [TOKEN_KEY]: { token, expiresAt } })
  return token
}

async function clearToken(): Promise<void> {
  await chrome.storage.session.remove(TOKEN_KEY)
}

export async function linkCalendar(): Promise<void> {
  await authToken(true)
}

export async function unlinkCalendar(): Promise<void> {
  await clearToken()
}

function requestBody(event: CalendarEvent): string {
  return JSON.stringify({
    summary: event.summary,
    location: event.location || undefined,
    description: event.description || undefined,
    start: { dateTime: toRfc3339(event.start), timeZone: UCSC_TIME_ZONE },
    end: { dateTime: toRfc3339(event.end), timeZone: UCSC_TIME_ZONE },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${event.byDay.join(',')};COUNT=${event.count}`],
  })
}

async function postEvent(event: CalendarEvent, token: string): Promise<Response> {
  return fetch(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: requestBody(event),
  })
}

/**
 * Creates one recurring Google Calendar event per entry in `events`,
 * sequentially, and reports per-event failures instead of aborting the whole
 * export on the first one — a partially-exported plan the user can retry is
 * more useful than an all-or-nothing failure, and there's no transactional
 * batch endpoint to get atomicity from anyway.
 *
 * A cached token that's expired comes back as a 401; that one case clears the
 * cached token and retries once with a fresh one.
 */
export async function exportEventsToGoogle(events: CalendarEvent[]): Promise<ExportResult> {
  let token = await authToken(true)
  const failed: ExportResult['failed'] = []
  let created = 0
  let refreshed = false

  for (const [index, event] of events.entries()) {
    try {
      let response = await postEvent(event, token)
      if (response.status === 401 && !refreshed) {
        refreshed = true
        await clearToken()
        token = await authToken(true)
        response = await postEvent(event, token)
      }
      if (!response.ok) {
        failed.push({ index, summary: event.summary, error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` })
        continue
      }
      created += 1
    } catch (err: unknown) {
      failed.push({ index, summary: event.summary, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { created, failed }
}
