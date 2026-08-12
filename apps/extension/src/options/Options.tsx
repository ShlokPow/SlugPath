import { useSettings } from '../storage/hooks'

const MAJORS = ['Computer Science B.S.', 'Computer Engineering B.S.', 'Undeclared']

// ponytail: static placeholder list; replaced by catalog-driven major list in Phase 2/5
export function Options() {
  const [settings, setSettings] = useSettings()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>SlugPath Settings</h1>
      <label htmlFor="major">Major</label>
      <select
        id="major"
        value={settings.majorCode ?? ''}
        onChange={(e) => setSettings({ majorCode: e.target.value })}
      >
        <option value="" disabled>
          Select a major
        </option>
        {MAJORS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </main>
  )
}
