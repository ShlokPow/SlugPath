import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }
// Bundled catalog snapshot version (see scripts/build-catalog-snapshot.ts). `version`
// must stay strict dotted-integer semver, so the catalog year rides in `version_name`.
import catalogVersion from '../../packages/catalog-snapshot/data/version.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'SlugPath',
  description: 'Plan UCSC schedules, prereqs, and GE progress without leaving MyUCSC or the catalog.',
  version: pkg.version,
  version_name: `${pkg.version} (catalog ${catalogVersion.version})`,
  permissions: ['storage', 'identity'],
  host_permissions: ['*://*.ucsc.edu/*', 'https://www.googleapis.com/*'],
  content_scripts: [
    {
      // Single entry, not split per-hostname: @crxjs/vite-plugin tracks
      // web_accessible_resources matches for a content script keyed by its
      // source filename, so two content_scripts entries pointing at the
      // same file silently lose the first entry's matches (only the last
      // one survives) — breaking the dynamic-import chunk load, and with it
      // the whole content script, on whichever host got dropped.
      // all_frames: true because MyUCSC (PeopleSoft) renders class-search
      // results inside a nested target iframe, not the top-level document —
      // the content script needs to run in every frame to reach it. It's a
      // no-op on any extra frame catalog.ucsc.edu doesn't have, and
      // index.tsx gates panel mounting to the top frame either way.
      matches: ['https://catalog.ucsc.edu/*', 'https://my.ucsc.edu/*'],
      js: ['src/content/index.tsx'],
      all_frames: true,
    },
  ],
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
})
