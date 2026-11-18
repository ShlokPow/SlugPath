import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }
// Bundled catalog snapshot version (see scripts/build-catalog-snapshot.ts). `version`
// must stay strict dotted-integer semver, so the catalog year rides in `version_name`.
import catalogVersion from '../../packages/catalog-snapshot/data/version.json' with { type: 'json' }

export default defineManifest({
  manifest_version: 3,
  name: 'SlugPath',
  description: 'Plan UCSC schedules and check prereqs without leaving MyUCSC.',
  version: pkg.version,
  version_name: `${pkg.version} (catalog ${catalogVersion.version})`,
  permissions: ['storage', 'identity'],
  host_permissions: ['*://*.ucsc.edu/*', 'https://www.googleapis.com/*'],
  // Google Calendar export (src/export/googleCalendar.ts). The client id is a
  // per-project credential from the Google Cloud console, not a repo secret to
  // commit: a real release build sets SLUGPATH_OAUTH_CLIENT_ID, and any other
  // build keeps the obvious placeholder, which authToken() refuses with a clear
  // message. Must be a "Web application" client whose redirect URI is
  // chrome.identity.getRedirectURL() (https://<extension-id>.chromiumapp.org/).
  oauth2: {
    // `||`, not `??`: an unset GitHub Actions secret arrives as an empty
    // string, which would otherwise ship as a blank client_id.
    client_id: process.env.SLUGPATH_OAUTH_CLIENT_ID || 'REPLACE_ME.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  },
  content_scripts: [
    {
      // Single entry, not split per-hostname: @crxjs/vite-plugin tracks
      // web_accessible_resources matches for a content script keyed by its
      // source filename, so two content_scripts entries pointing at the
      // same file silently lose the first entry's matches (only the last
      // one survives) — breaking the dynamic-import chunk load, and with it
      // the whole content script, on whichever host got dropped.
      // all_frames: true because MyUCSC renders class-search results inside
      // a nested target iframe, not the top-level document — the content
      // script needs to run in every frame to reach it. index.tsx gates
      // panel mounting to the top frame either way.
      // pisa.ucsc.edu: MyUCSC's "Main Content" iframe navigates there for
      // the actual class-search results grid (a UCSC-built page, not
      // PeopleSoft-rendered) — without it listed here, that frame never
      // gets the content script and the row buttons never appear.
      matches: ['https://my.ucsc.edu/*', 'https://pisa.ucsc.edu/*'],
      js: ['src/content/index.tsx'],
      all_frames: true,
    },
  ],
  options_page: 'src/options/index.html',
  // No default_icon/default_popup: icon assets don't exist yet (later polish
  // item) and the popup is a full tab (see background's onClicked), not a
  // toolbar dropdown.
  action: {},
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
})
