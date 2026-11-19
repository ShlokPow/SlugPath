import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import type { CatalogSnapshot } from '../packages/catalog-snapshot/src/types.ts'
import { parsePrereq } from '../packages/prereq-parser/src/index.ts'

const gzPath = fileURLToPath(new URL('../packages/catalog-snapshot/data/catalog-snapshot.json.gz', import.meta.url))
const snapshot: CatalogSnapshot = JSON.parse(gunzipSync(readFileSync(gzPath)).toString('utf8'))

const withPrereq = snapshot.courses.filter((c) => c.prereqRaw.trim() !== '')

let parsed = 0
const failureCounts = new Map<string, number>()

for (const course of withPrereq) {
  const result = parsePrereq(course.prereqRaw)
  if (result.ok) {
    parsed++
    continue
  }
  const normalised = course.prereqRaw
    .replace(/\b[A-Z]{2,5} ?\d+[A-Z]*\b/g, 'X')
    .replace(/\d+/g, 'N')
  failureCounts.set(normalised, (failureCounts.get(normalised) ?? 0) + 1)
}

const total = withPrereq.length
console.log(`${parsed}/${total} (${((parsed / total) * 100).toFixed(1)}%)`)
console.log('')

const top = [...failureCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
for (const [text, count] of top) {
  console.log(`${count}  ${text}`)
}
