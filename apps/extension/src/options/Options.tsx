import { useState, type FormEvent } from 'react'
import { googleConfigured } from '../export/googleCalendar'
import { requestCalendarLink, requestCalendarUnlink } from '../export/messages'
import { useSettings, useTakenCourses } from '../storage/hooks'
import { addTakenCourse, removeTakenCourse } from '../storage/takenCourseStore'
import catalogVersion from '@slugpath/catalog-snapshot/data/version.json'

export function Options() {
  const [settings, setSettings] = useSettings()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1>SlugPath Settings</h1>

      <section>
        <h2>Catalog</h2>
        <p style={{ margin: '4px 0' }}>
          Catalog year: <strong>{catalogVersion.version}</strong>
        </p>
      </section>

      {googleConfigured() && (
        <GoogleCalendarSection linked={settings.calendarLinked} onLinkedChange={(calendarLinked) => setSettings({ calendarLinked })} />
      )}
      <TakenCoursesSection />
    </main>
  )
}

function GoogleCalendarSection({ linked, onLinkedChange }: { linked: boolean; onLinkedChange: (linked: boolean) => void }) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Both paths go through the background worker (export/messages.ts) even
  // though this page could call chrome.identity itself — one owner of the
  // token lifecycle, shared with the content-script export path.
  async function run(action: 'link' | 'unlink') {
    setBusy(true)
    setStatus(null)
    try {
      if (action === 'link') {
        await requestCalendarLink()
        onLinkedChange(true)
        setStatus('Google account linked.')
      } else {
        await requestCalendarUnlink()
        onLinkedChange(false)
        setStatus('Google account unlinked. SlugPath can no longer create events until you link again.')
      }
    } catch (err: unknown) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Google Calendar</h2>
      <p style={{ margin: '4px 0' }}>
        Status: <strong>{linked ? 'linked' : 'not linked'}</strong>. Export itself lives in the schedule panel on MyUCSC; linking here is
        optional, since the first export asks for access anyway.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void run('link')} disabled={busy}>
          Link Google account
        </button>
        <button type="button" onClick={() => void run('unlink')} disabled={busy}>
          Unlink
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  )
}

// Codes are stored whitespace-stripped ("CSE12") so hand-typed entries match
// the catalog index; re-insert the space for display only.
function displayCode(code: string): string {
  return code.replace(/^([A-Z]+)(\d.*)$/, '$1 $2')
}

function TakenCoursesSection() {
  const takenCourses = useTakenCourses()
  const [code, setCode] = useState('')
  const [term, setTerm] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    await addTakenCourse(code, term)
    setCode('')
    setTerm('')
  }

  return (
    <section>
      <h2>Courses already taken</h2>
      <p style={{ margin: '4px 0' }}>
        Used for prerequisite and GE checks. The &ldquo;Import GE completions&rdquo; button on MyUCSC&rsquo;s Degree Progress Report fills
        this in automatically; add anything it missed by hand.
      </p>
      <form onSubmit={(e) => void handleAdd(e)} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '8px 0' }}>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Course code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSE 12" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          Term (optional)
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Fall 2025" />
        </label>
        <button type="submit">Add</button>
      </form>
      {takenCourses === undefined ? (
        <p>Loading…</p>
      ) : takenCourses.length === 0 ? (
        <p>No taken courses recorded yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {takenCourses.map((taken) => (
            <li key={taken.courseCode} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
              <span style={{ minWidth: 90 }}>{displayCode(taken.courseCode)}</span>
              <span style={{ color: '#555', minWidth: 110 }}>{taken.term || '—'}</span>
              <button
                type="button"
                aria-label={`Remove ${displayCode(taken.courseCode)} from taken courses`}
                onClick={() => void removeTakenCourse(taken.courseCode)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
