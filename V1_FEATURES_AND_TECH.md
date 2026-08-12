# SlugPath V1 Features and Technology Blueprint

## Scope of this document
This document defines exactly what ships in **v1** and the concrete technologies used to build it.

It is intentionally implementation-focused and separate from the main product spec.

## V1 feature set (must ship)

### 1) Schedule builder overlay
- Injected side panel on MyUCSC class search pages.
- "Add to plan" button injected into every visible search result row.
- Weekly grid renders picked sections; conflicts highlighted in real time.
- Multiple named plans (switchable via panel dropdown).
- Export selected plan to Google Calendar (batch event creation).
- Export selected plan to `.ics` file (no auth required).
- All state persists across sessions and browser restarts.

### 2) Prerequisite chain visualizer
- Injected graph on every `catalog.ucsc.edu` course page.
- Two-direction traversal (Requires / Unlocks), 2 levels default, expandable.
- Nodes navigate to that course's catalog page.
- Nodes badged with GE codes and "planned" / "taken" markers pulled from Dexie.
- AND/OR gate rendering for parsed compound prereqs.
- Raw-text fallback node for prereq strings that fail to parse.

### 3) GE requirement tracker
- Inline GE badges on every catalog course page and MyUCSC search result.
- Standalone GE checklist tab (extension page) showing required GEs vs planned/completed courses for the declared major.
- Double-dip detection and manual assignment when a course satisfies multiple GEs.

### 4) Settings and identity
- Options page: declare major, choose catalog year, view Google account link status, edit taken-courses list.
- Google Calendar linkage via `chrome.identity.getAuthToken` (opt-in, revocable).

### 5) Storage
- IndexedDB (Dexie) for plans, taken courses, cached course data.
- `chrome.storage.local` for user settings.

## V1 non-goals (explicitly excluded)
- Professor ratings or grade distributions.
- Full multi-year degree planner (per-term schedule building only).
- Cross-device or cross-browser sync.
- Backend server, user accounts, or off-device analytics.
- Mobile support.
- Non-UCSC schools.
- Automated pull of the student's actual academic record (grades, transcripts). Users self-report taken courses in v1.

## Technology stack (exact choices for v1)

### Extension shell
- **Manifest**: Chrome Extension Manifest V3.
- **Language**: TypeScript, strict mode.
- **Build tool**: Vite + `@crxjs/vite-plugin`. Chosen over Webpack because it is MV3-aware out of the box, HMR works across content scripts and options pages, and the config is minimal.
- **Package manager**: pnpm.

### UI
- **Framework**: React 18.
- **Component isolation**: All content-script UI mounts inside a **shadow DOM** root. This prevents MyUCSC and catalog styles from leaking in and prevents Tailwind's preflight from leaking out. Extension pages (options, GE tab) render normally without shadow DOM.
- **Styling**: Tailwind CSS. `preflight: false` for the shadow-DOM builds; standard preflight for extension-page builds.
- **UI state**: Zustand, backed by a `chrome.storage`-aware persister for state that needs to be shared across popup, options, and content-script contexts.
- **Icons**: `lucide-react`.

### Graph rendering
- **Library**: React Flow. Chosen over D3 because React Flow is purpose-built for node-and-edge graphs, integrates with React state, and provides zoom/pan/hit-testing for free. Using D3 here would mean rebuilding infrastructure React Flow already offers.
- **Layout**: `dagre` for automatic top-down layout of the prereq DAG.

### Data layer
- **IndexedDB wrapper**: Dexie 4.
- **Schemas**:
  - `plans`: `{ id, name, term, sections[], createdAt, updatedAt }`
  - `takenCourses`: `{ courseCode, term, gradeSelfReported? }`
  - `settings`: `{ majorCode, catalogYear, calendarLinked, defaultTerm }` (also mirrored in `chrome.storage.local`)
  - `catalogCache`: `{ courseCode, catalogYear, snapshot, fetchedAt }`
- **In-extension queries**: Dexie live queries + `useLiveQuery` hooks so every mount point reacts to the same data with no bespoke message-passing.

### Parsing
- **Catalog HTML parser**: `htmlparser2` for on-demand fetches of catalog pages not present in the bundled snapshot.
- **MyUCSC DOM parser**: Custom selector layer, isolated in `src/adapters/myucsc.ts`. Every MyUCSC selector lives in one file so a DOM change requires a single-file update. MyUCSC is PeopleSoft-based and its DOM is fragile — this isolation is a hard requirement.
- **Prerequisite grammar**: Hand-written recursive-descent parser over tokenized prereq prose. Grammar supports AND, OR, parentheses, "or equivalent," grade minima ("C or better in …"), and concurrent-enrollment markers. Fails safely to a raw-text node.

### Bundled catalog snapshot
- **Format**: JSON, gzipped, shipped with the extension.
- **Contents**: every UCSC undergrad course with `{ code, title, units, prereqRaw, prereqParsed, geCodes, termsOffered }`.
- **Build step**: `scripts/build-catalog-snapshot.ts` scrapes the catalog at release time; commits the resulting JSON to the repo.
- **Rationale**: fetching every course page on demand is too slow and too fragile for a first-run experience.

### Google Calendar export
- **Auth**: `chrome.identity.getAuthToken({ interactive: true })` using an OAuth2 client ID declared in `manifest.json`'s `oauth2` field with scope `https://www.googleapis.com/auth/calendar.events`.
- **API calls**: Direct `fetch` from the background service worker to `https://www.googleapis.com/calendar/v3/calendars/primary/events`.
- **Event generation**: one event per meeting pattern per section with `RRULE:FREQ=WEEKLY` bounded by the term's academic calendar dates (bundled with the extension).

### iCal export
- **Library**: `ics` (npm).
- Same event model as the Google Calendar path, rendered to a `.ics` file downloaded via a blob URL.

### Testing
- **Unit tests**: Vitest.
- **Component tests**: React Testing Library.
- **Parser tests**: fixture-based; a directory of real catalog prereq strings mapped to expected ASTs.
- **E2E**: Playwright, driving Chrome with the extension loaded against a set of static HTML fixtures that mimic MyUCSC and the catalog. No live scraping in CI.

### Distribution
- **Chrome Web Store**: signed ZIP built by CI on tagged releases.
- **Versioning**: Semver; the catalog snapshot version is embedded in the extension version metadata.

## Why this stack is efficient for v1
- Vite + `@crxjs` removes MV3 build configuration that historically eats days of setup.
- React Flow + dagre delivers a working, navigable graph without a bespoke rendering engine.
- Dexie + `useLiveQuery` means content script, options page, and GE tracker all react to the same data with no message-passing layer.
- Shadow DOM isolation removes an entire class of style-leak bugs before they can appear.
- Zero server means zero hosting cost, no auth system to build, and no privacy review beyond the Chrome Web Store's own.

## Notable divergences from the original prompt
- The prompt allowed "React Flow **or** D3" for the prereq graph. This spec commits to React Flow.
- The prompt did not specify a build tool or state manager. Vite (`@crxjs`) and Zustand are the choices.
- The prompt did not address style isolation. Shadow DOM is treated as a hard requirement for any content-script UI.
- The prompt did not address where course/catalog data comes from. A bundled snapshot + on-demand fetch is treated as a hard requirement.
- The prompt did not mention a MyUCSC selector-abstraction layer. PeopleSoft DOM fragility makes this non-optional.

## V1 execution plan

### Phase 0 — Repo and build setup
**Goal**: `pnpm dev` produces a loadable unpacked extension that opens on `catalog.ucsc.edu` and injects a "Hello SlugPath" panel.

- [ ] Initialize pnpm workspace with `apps/extension` and `packages/catalog-snapshot`.
- [ ] Configure Vite + `@crxjs/vite-plugin`; TypeScript strict; ESLint + Prettier.
- [ ] Write `manifest.json` (MV3) with permissions `storage`, `identity`; host permissions `*.ucsc.edu/*`, `www.googleapis.com/*`.
- [ ] Set up content script that mounts a React root inside a shadow DOM on `catalog.ucsc.edu/*` and `my.ucsc.edu/*`.
- [ ] Set up options page (extension page, not content script) with placeholder major picker.
- [ ] Set up service worker with a heartbeat log to confirm MV3 wiring.
- [ ] GitHub Actions: lint + typecheck + unit test on every PR; build extension ZIP on tag.

---

### Phase 1 — Storage layer
**Goal**: all persisted schemas exist; settings persist in `chrome.storage.local`; UI reads and writes both.

- [ ] Define Dexie DB with tables `plans`, `takenCourses`, `catalogCache`.
- [ ] Define `chrome.storage.local` schema for settings; write a typed wrapper `settingsStore.ts`.
- [ ] Bridge Zustand to `chrome.storage` for shared settings across contexts.
- [ ] `useLiveQuery` hooks: `usePlans()`, `useTakenCourses()`, `useSettings()`.
- [ ] Migration harness: schema version bump procedure documented in `docs/migrations.md`.

---

### Phase 2 — Catalog snapshot
**Goal**: a JSON snapshot of the full UCSC undergrad catalog ships with the extension.

- [ ] Write `scripts/build-catalog-snapshot.ts`: fetches every catalog course page, extracts `{ code, title, units, prereqRaw, geCodes, termsOffered }`, and writes `catalog-snapshot.json.gz`.
- [ ] Add rate-limiting and retry to the scraper; runs manually on release, not in CI.
- [ ] Write a lightweight query API over the snapshot: `getCourse(code)`, `search(q)`, `coursesSatisfying(geCode)`.
- [ ] Embed snapshot version in the extension version string.

---

### Phase 3 — Prereq parser and graph
**Goal**: every catalog course page renders a correct prereq graph, or falls back to a labeled raw-text node.

- [ ] Tokenizer for prereq prose: course codes, AND/OR, parentheses, grade minima, "or equivalent," "concurrent enrollment in ...".
- [ ] Recursive-descent parser producing an AST of `Course | And | Or | Constraint`.
- [ ] Fixture test suite: at least 100 real prereq strings from the catalog with expected ASTs.
- [ ] AST → React Flow node/edge model, with dagre layout.
- [ ] Direction toggle (Requires / Unlocks), depth control.
- [ ] Node click navigates to the target course's catalog page.
- [ ] Node badge shows "planned" / "taken" state from Dexie.
- [ ] Fallback: unparseable prereq string renders as a single raw-text node with an explanatory hint.

---

### Phase 4 — MyUCSC adapter and schedule builder
**Goal**: on MyUCSC class search pages, the user can add sections to a plan and see conflicts.

- [ ] `adapters/myucsc.ts`: single module owning every MyUCSC DOM selector. Exports `parseSearchResults()`, `getCurrentTerm()`, `waitForResults()`.
- [ ] Handle MyUCSC's iframe/table structure with defensive selectors and integration tests against captured fixture HTML.
- [ ] Inject "Add to plan" button into each search result row.
- [ ] Side panel React component: current plan, weekly grid, conflict warnings.
- [ ] Conflict detector: pairwise overlap check on meeting patterns.
- [ ] Plan management UI: create / rename / delete / duplicate; plan switcher dropdown.
- [ ] Persist plans to Dexie on every mutation.
- [ ] Handle cross-listed courses and lecture+lab pairs as an atomic unit.

---

### Phase 5 — GE tracker
**Goal**: users see GE coverage inline and get a full tracker tab that reflects their major.

- [ ] Ship a per-major GE requirements dataset in `packages/catalog-snapshot`.
- [ ] Options page: major picker + catalog year picker; writes to settings.
- [ ] Inline overlay: on every catalog course page and MyUCSC search row, badge each course with its GE codes.
- [ ] Double-dip detection: mark a GE badge as "already covered" if the user's plan/taken set already fills it.
- [ ] Standalone GE tracker page (extension page): requirement list, satisfied vs planned vs open, per-course drill-down.
- [ ] Assignment UI for courses that could count toward multiple GEs.
- [ ] Progress summary at top of tracker page (X of Y GEs satisfied, Z planned).

---

### Phase 6 — Google Calendar and iCal export
**Goal**: a plan can be exported to Google Calendar or downloaded as `.ics`.

- [ ] Add `oauth2` block to `manifest.json` with client ID and calendar scope.
- [ ] Wrap `chrome.identity.getAuthToken` in a promise-returning helper with error paths for user-declined and token-expired.
- [ ] Export flow (Google): confirm dialog → build event list → POST each event → progress toast → success or partial-fail summary with retry.
- [ ] Event generation: one `RRULE:FREQ=WEEKLY;BYDAY=...;UNTIL=...` event per meeting pattern.
- [ ] Bundled academic-calendar dates by term used to bound RRULE.
- [ ] iCal path: generate `.ics` from the same event model, download via blob URL.
- [ ] Revoke-linkage button in options that clears the cached token via `chrome.identity.removeCachedAuthToken`.

---

### Phase 7 — Polish and hardening
**Goal**: extension is stable enough to submit to the Chrome Web Store.

- [ ] MyUCSC DOM change harness: load a set of captured MyUCSC snapshots and confirm the adapter still parses. Any failure logs a clear "MyUCSC layout changed" error to the panel instead of crashing.
- [ ] Fallback UI for every content-script mount point when parsing fails.
- [ ] Accessibility pass: keyboard nav for the schedule panel and prereq graph; ARIA labels on injected controls.
- [ ] Copy pass: every user-facing string reviewed for tone and clarity.
- [ ] Icon set and Chrome Web Store screenshots produced.
- [ ] Privacy policy page hosted (static, GitHub Pages is fine) — required by the Web Store even for zero-collection extensions.

---

### Phase 8 — Release
**Goal**: v1 is live on the Chrome Web Store with a rollback path.

- [ ] Tag release; CI builds signed ZIP.
- [ ] Submit to Chrome Web Store; respond to review feedback.
- [ ] Rollback plan: previous ZIP retained; users can sideload if a bad release ships.
- [ ] Post-launch: open a "SlugPath v2 candidates" issue list capturing everything cut from v1 (four-year planner, professor ratings, grade distributions, cross-device sync).

---

## V1 release readiness checklist
- Fresh install → catalog page → prereq graph renders correctly.
- Fresh install → options → major picked → GE tracker shows accurate progress.
- Fresh install → MyUCSC search → sections addable → conflicts flagged → plan persists across browser restart.
- Google Calendar export creates correct recurring events for a full-term plan.
- iCal export downloads a valid `.ics` importable by Google, Apple, and Outlook calendars.
- No content-script style bleed into MyUCSC or the catalog.
- Extension handles a MyUCSC DOM change gracefully — user sees a fallback message, not JS errors.
- Chrome Web Store listing approved.
