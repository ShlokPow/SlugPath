import { heartbeatMessage } from '../shared/heartbeat'
import { exportEventsToGoogle, linkCalendar, unlinkCalendar } from '../export/googleCalendar'
import type { ExportMessage, ExportResponse } from '../export/messages'

// ponytail: setInterval would silently stop once the MV3 service worker suspends
// (~30s idle); chrome.alarms is the correct periodic primitive but needs the
// "alarms" permission, not in the v1 permission list. Load + lifecycle logs only.
console.log(heartbeatMessage('load'))

chrome.runtime.onInstalled.addListener((details) => {
  console.log(heartbeatMessage(`onInstalled:${details.reason}`))
})

chrome.runtime.onStartup.addListener(() => {
  console.log(heartbeatMessage('onStartup'))
})

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/ge-tracker/index.html') })
})

// Google Calendar work lives here because chrome.identity isn't exposed to
// content scripts — the SchedulePanel and the options page both reach it
// through export/messages.ts. See export/googleCalendar.ts for the API calls.
async function handleExportMessage(message: ExportMessage): Promise<ExportResponse> {
  try {
    if (message.type === 'slugpath:calendar-link') {
      await linkCalendar()
      return { ok: true }
    }
    if (message.type === 'slugpath:calendar-unlink') {
      await unlinkCalendar()
      return { ok: true }
    }
    return { ok: true, result: await exportEventsToGoogle(message.events) }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

chrome.runtime.onMessage.addListener((message: ExportMessage, _sender, sendResponse) => {
  if (!message?.type?.startsWith('slugpath:calendar-')) return false
  // `return true` keeps the message channel open for the async reply — without
  // it Chrome closes it the moment this listener returns and sendResponse is a
  // no-op.
  void handleExportMessage(message).then(sendResponse)
  return true
})
