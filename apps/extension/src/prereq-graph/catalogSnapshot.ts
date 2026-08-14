// Loads the bundled catalog snapshot once and caches the in-memory index.
// The package only ships the raw gzipped JSON (see packages/catalog-snapshot/src/index.ts —
// it exports types + the query API, not a loader), so the extension is
// responsible for fetching + decompressing it. Uses the native
// DecompressionStream (Chrome-native since M80) instead of pulling in a gzip
// library — one Chrome-only extension, no need for a cross-platform decoder.
import snapshotUrl from '@slugpath/catalog-snapshot/data/catalog-snapshot.json.gz?url'
import { createCatalogIndex, type CatalogIndex, type CatalogSnapshot } from '@slugpath/catalog-snapshot'

let cached: Promise<{ index: CatalogIndex; snapshot: CatalogSnapshot }> | undefined

export function loadCatalog(): Promise<{ index: CatalogIndex; snapshot: CatalogSnapshot }> {
  if (!cached) {
    cached = fetchAndDecode()
  }
  return cached
}

async function fetchAndDecode(): Promise<{ index: CatalogIndex; snapshot: CatalogSnapshot }> {
  // Vite's `?url` import yields a path that resolves correctly from the
  // extension's own pages (options/popup), but this runs inside a content
  // script — there the page's origin (e.g. https://catalog.ucsc.edu) is what
  // relative URLs resolve against, not the extension's. chrome.runtime.getURL
  // gives the real chrome-extension://<id>/... URL regardless of context.
  const res = await fetch(chrome.runtime.getURL(snapshotUrl))
  if (!res.body) throw new Error('loadCatalog: empty response body for bundled catalog snapshot')
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text()
  const snapshot = JSON.parse(text) as CatalogSnapshot
  return { index: createCatalogIndex(snapshot), snapshot }
}
