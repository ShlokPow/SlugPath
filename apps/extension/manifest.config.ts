import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'SlugPath',
  description: 'Plan UCSC schedules, prereqs, and GE progress without leaving MyUCSC or the catalog.',
  version: pkg.version,
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
