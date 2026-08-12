import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { CatalogSnapshot, CourseSnapshot } from '../packages/catalog-snapshot/src/types.ts'
import { fetchWithRetry } from './catalog/fetch-with-retry.ts'
import { parseSubjectIndexHtml, parseSubjectPageHtml } from './catalog/parse.ts'

const INDEX_URL = 'https://catalog.ucsc.edu/en/current/general-catalog/courses'
const BASE_URL = 'https://catalog.ucsc.edu'
// ponytail: fixed delay between subject fetches, not adaptive throttling —
// this only needs to be "polite", not clever. Runs manually on release, not CI.
const REQUEST_DELAY_MS = 500

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../packages/catalog-snapshot/data')

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Fetches the subject index, then every subject page, and assembles the snapshot. */
export async function buildSnapshot(): Promise<CatalogSnapshot> {
  const indexHtml = await fetchWithRetry(INDEX_URL)
  if (!indexHtml) throw new Error('failed to fetch the subject index page after retries')

  const { version, subjectSlugs } = parseSubjectIndexHtml(indexHtml)
  console.log(`[catalog-snapshot] catalog version ${version}, ${subjectSlugs.length} subjects`)

  const courses: CourseSnapshot[] = []
  for (const slug of subjectSlugs) {
    const url = `${BASE_URL}/en/current/general-catalog/courses/${slug}`
    const html = await fetchWithRetry(url)
    if (!html) {
      console.warn(`[catalog-snapshot] skipping subject "${slug}" — all fetch attempts failed`)
    } else {
      const parsed = parseSubjectPageHtml(html)
      for (const course of parsed) courses.push({ ...course, termsOffered: [] })
      console.log(`[catalog-snapshot] ${slug}: ${parsed.length} courses`)
    }
    await sleep(REQUEST_DELAY_MS)
  }

  return { version, generatedAt: new Date().toISOString(), courses }
}

function writeSnapshot(snapshot: CatalogSnapshot): void {
  mkdirSync(OUT_DIR, { recursive: true })

  const gz = gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf-8'))
  writeFileSync(path.join(OUT_DIR, 'catalog-snapshot.json.gz'), gz)

  const sidecar = {
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    courseCount: snapshot.courses.length,
  }
  writeFileSync(path.join(OUT_DIR, 'version.json'), JSON.stringify(sidecar, null, 2) + '\n')
}

async function main(): Promise<void> {
  const snapshot = await buildSnapshot()
  writeSnapshot(snapshot)
  console.log(
    `[catalog-snapshot] wrote ${snapshot.courses.length} courses (version ${snapshot.version}) to ${OUT_DIR}`,
  )
}

// ponytail: entry-point guard so this file stays import-safe for tests without running the scraper
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err: unknown) => {
    console.error('[catalog-snapshot] build failed:', err)
    process.exitCode = 1
  })
}
