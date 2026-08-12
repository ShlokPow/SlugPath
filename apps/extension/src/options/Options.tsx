const MAJORS = ['Computer Science B.S.', 'Computer Engineering B.S.', 'Undeclared']

// ponytail: static placeholder list; replaced by catalog-driven major list in Phase 2/5
export function Options() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>SlugPath Settings</h1>
      <label htmlFor="major">Major</label>
      <select id="major" defaultValue={MAJORS[0]}>
        {MAJORS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <p>Selection isn&apos;t saved yet — settings persistence ships in Phase 1.</p>
    </main>
  )
}
