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
      matches: ['https://catalog.ucsc.edu/*', 'https://my.ucsc.edu/*'],
      js: ['src/content/index.tsx'],
    },
  ],
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
})
