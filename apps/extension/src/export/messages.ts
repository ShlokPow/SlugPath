// The one message contract between UI contexts and the background service
// worker. Everything Google-Calendar-related has to round-trip through the
// worker because chrome.identity isn't available in a content script, and the
// options page uses the same messages rather than a second direct code path.

import type { CalendarEvent } from './events'
import type { ExportResult } from './googleCalendar'

export type ExportMessage =
  | { type: 'slugpath:calendar-link' }
  | { type: 'slugpath:calendar-unlink' }
  | { type: 'slugpath:calendar-export'; events: CalendarEvent[] }

export type ExportResponse = { ok: true; result?: ExportResult } | { ok: false; error: string }

async function send(message: ExportMessage): Promise<ExportResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as ExportResponse | undefined
    // undefined = no listener answered (worker didn't handle the message).
    return response ?? { ok: false, error: 'SlugPath background worker did not respond — reload the extension and try again.' }
  } catch (err: unknown) {
    // A suspended/reloaded service worker, or an extension update mid-click,
    // rejects here rather than answering — surface it like any other failure
    // instead of leaving the caller hanging on an unhandled rejection.
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function unwrap(response: ExportResponse): ExportResult | undefined {
  if (!response.ok) throw new Error(response.error)
  return response.result
}

export async function requestCalendarLink(): Promise<void> {
  unwrap(await send({ type: 'slugpath:calendar-link' }))
}

export async function requestCalendarUnlink(): Promise<void> {
  unwrap(await send({ type: 'slugpath:calendar-unlink' }))
}

export async function requestCalendarExport(events: CalendarEvent[]): Promise<ExportResult> {
  const result = unwrap(await send({ type: 'slugpath:calendar-export', events }))
  if (!result) throw new Error('SlugPath: export returned no result')
  return result
}
