import { useSettings } from '../storage/hooks'

const MAJORS = ['Computer Science B.S.', 'Computer Engineering B.S.', 'Undeclared']

// ponytail: static placeholder list; replaced by catalog-driven major list in Phase 2/5
// ponytail: only one catalog snapshot is bundled (packages/catalog-snapshot/data/version.json),
// so this is a one-option placeholder rather than a real picker; grow the list once a
// second catalog year is scraped and bundled alongside it.
const CATALOG_YEARS = ['2026-2027']

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

      <label htmlFor="catalogYear">Catalog year</label>
      <select
        id="catalogYear"
        value={settings.catalogYear ?? ''}
        onChange={(e) => setSettings({ catalogYear: e.target.value })}
      >
        <option value="" disabled>
          Select a catalog year
        </option>
        {CATALOG_YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </main>
  )
}
