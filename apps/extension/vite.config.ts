import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // ge-tracker/index.html is opened at runtime via chrome.tabs.create, not
  // through any manifest field @crxjs/vite-plugin scans for HTML entries
  // (options_page, action.default_popup, devtools_page, sandbox, side_panel)
  // — without an explicit rollup input it silently never gets built.
  build: {
    rollupOptions: {
      input: {
        'ge-tracker': 'src/ge-tracker/index.html',
      },
    },
  },
})
