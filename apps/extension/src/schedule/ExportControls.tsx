import { useMemo, useState, type CSSProperties } from 'react'
import { planToEvents, type CalendarEvent } from '../export/events'
import { eventsToIcs, icsFilename } from '../export/ics'
import { requestCalendarExport } from '../export/messages'
import { useSettings } from '../storage/hooks'
import type { Plan } from '../storage/types'

// Export section of the SchedulePanel: turns the active plan into recurring
// calendar events, either downloaded as .ics (no auth) or POSTed to Google
// Calendar through the background worker (export/messages.ts).
//
// The term date range is asked for rather than looked up: UCSC's real quarter
// start/end dates aren't in the bundled catalog snapshot, and a guessed range
// would silently produce recurring events that run for the wrong number of
// weeks. Native <input type="date"> rather than a date-picker component.
export function ExportControls({ plan }: { plan: Plan }) {
  const [, setSettings] = useSettings()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  // Errors render red: a blocked click otherwise re-sets the same text the idle
  // hint already shows, which reads as "the button does nothing".
  const [isError, setIsError] = useState(false)

  function show(text: string | null, error = false) {
    setStatus(text)
    setIsError(error)
  }
  const [busy, setBusy] = useState(false)
  const [retryable, setRetryable] = useState<CalendarEvent[]>([])

  const events = useMemo(() => planToEvents(plan, { start, end }), [plan, start, end])
  const blocker = exportBlocker(plan, start, end, events.length)

  function handleDownload() {
    if (blocker) return show(blocker, true)
    const blob = new Blob([eventsToIcs(events)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = icsFilename(plan.name)
    link.click()
    // Revoked on a delay, not immediately: Chrome starts the download
    // asynchronously after the synthetic click, and revoking first can cancel
    // it outright.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    show(`Downloaded ${events.length} event${events.length === 1 ? '' : 's'} as .ics.`)
  }

  async function runGoogleExport(toExport: CalendarEvent[]) {
    setBusy(true)
    show(`Exporting ${toExport.length} event${toExport.length === 1 ? '' : 's'} to Google Calendar…`)
    try {
      const result = await requestCalendarExport(toExport)
      setSettings({ calendarLinked: true })
      const failedEvents = result.failed.map((f) => toExport[f.index]).filter((e): e is CalendarEvent => Boolean(e))
      setRetryable(failedEvents)
      show(
        result.failed.length === 0
          ? `Created ${result.created} event${result.created === 1 ? '' : 's'} in Google Calendar.`
          : `Created ${result.created}, ${result.failed.length} failed (${result.failed[0]?.error ?? 'unknown error'}).`,
        result.failed.length > 0,
      )
    } catch (err: unknown) {
      setRetryable([])
      show(`Google Calendar export failed: ${err instanceof Error ? err.message : String(err)}`, true)
    } finally {
      setBusy(false)
    }
  }

  function handleGoogleExport() {
    if (blocker) return show(blocker, true)
    // Chrome can also return false without showing the dialog (dialogs
    // suppressed for the page), so say so rather than doing nothing.
    if (!window.confirm(`Create ${events.length} recurring events in your Google Calendar?`)) {
      show('Google Calendar export cancelled.')
      return
    }
    void runGoogleExport(events)
  }

  return (
    <div style={{ padding: '8px 10px', borderBottom: '1px solid #ddd', fontSize: 11 }}>
      <div style={{ fontWeight: 600, color: '#003c6c', marginBottom: 4 }}>Export</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <label style={labelStyle}>
          First day
          <input type="date" value={start} onChange={(e) => {
              setStart(e.target.value)
              show(null)
            }} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Last day
          <input type="date" value={end} onChange={(e) => {
              setEnd(e.target.value)
              show(null)
            }} style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleDownload} disabled={busy} style={buttonStyle}>
          Download .ics
        </button>
        <button type="button" onClick={handleGoogleExport} disabled={busy} style={buttonStyle}>
          Add to Google Calendar
        </button>
        {retryable.length > 0 && (
          <button type="button" onClick={() => void runGoogleExport(retryable)} disabled={busy} style={buttonStyle}>
            Retry {retryable.length} failed
          </button>
        )}
      </div>
      <div role="status" style={{ marginTop: 4, color: isError ? '#a33' : '#555', fontWeight: isError ? 600 : 400 }}>
        {status ?? blocker ?? `${events.length} event${events.length === 1 ? '' : 's'} ready.`}
      </div>
    </div>
  )
}

// Why there's nothing to export, or null when there is. The buttons stay
// enabled and show this on click instead of being disabled: a disabled button
// with the same inline styling looks clickable and silently does nothing.
export function exportBlocker(plan: Plan, start: string, end: string, eventCount: number): string | null {
  if (eventCount > 0) return null
  if (!start || !end) return 'Pick the term’s first and last day of instruction.'
  if (start > end) return 'The first day must be on or before the last day.'
  if (plan.sections.length === 0) return 'This plan has no sections to export.'
  return 'No section in this plan has scheduled meeting times in that date range.'
}

const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, color: '#555' }

const inputStyle: CSSProperties = {
  fontSize: 11,
  padding: '2px 4px',
  borderRadius: 4,
  border: '1px solid #ccc',
}

const buttonStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid #003c6c',
  background: '#fff',
  color: '#003c6c',
  cursor: 'pointer',
  fontSize: 11,
}
