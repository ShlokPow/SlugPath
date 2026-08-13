import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePrereq } from './parser'
import type { CatalogSnapshot } from '../../catalog-snapshot/src/types'

// Regression corpus: a deterministic, representative sample of real UCSC catalog
// prereqRaw strings pulled straight from the bundled snapshot (not hand-picked),
// spread across the whole file so both clean single-clause strings and long messy
// multi-sentence ones are represented. The resulting parsePrereq output (a mix of
// ok:true ASTs and ok:false fallbacks) is pinned via toMatchSnapshot() — that
// committed .snap file *is* the "real strings -> expected ASTs" mapping, reviewed
// once at commit time instead of hand-transcribed.
const gzPath = fileURLToPath(new URL('../../catalog-snapshot/data/catalog-snapshot.json.gz', import.meta.url))
const snapshot: CatalogSnapshot = JSON.parse(gunzipSync(readFileSync(gzPath)).toString('utf8'))

const withPrereq = snapshot.courses.filter((c) => c.prereqRaw.trim() !== '')

const SAMPLE_SIZE = 150
const stride = Math.max(1, Math.floor(withPrereq.length / SAMPLE_SIZE))
const sample = withPrereq.filter((_, i) => i % stride === 0).slice(0, SAMPLE_SIZE)

describe('parsePrereq — fixture regression corpus', () => {
  it(`parses a ${sample.length}-entry sample of real prereqRaw strings (see .snap for the pinned mix of ASTs and fallbacks)`, () => {
    expect(sample.length).toBeGreaterThanOrEqual(100)

    const results = sample.map((c) => ({
      code: c.code,
      prereqRaw: c.prereqRaw,
      result: parsePrereq(c.prereqRaw),
    }))

    expect(results).toMatchSnapshot()
  })

  it('reports the ok:true vs ok:false split for this sample (informational)', () => {
    const okCount = sample.filter((c) => parsePrereq(c.prereqRaw).ok).length
    // Not a strict assertion — the parser deliberately falls back on prose it can't
    // safely reduce to boolean course logic. This just guards against a total
    // regression (e.g. everything suddenly failing because of a tokenizer bug).
    expect(okCount).toBeGreaterThan(0)
    expect(okCount).toBeLessThanOrEqual(sample.length)
  })
})
