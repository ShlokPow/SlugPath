# SlugPath Architecture

This is the engineering reference for SlugPath: what exists, how the pieces
fit together, and why they were built this way. It reflects the code on
`main` — not aspirational spec, not an in-progress branch. If you read
something here and the code disagrees, the code wins; fix this doc in the
same commit that changes the behavior it describes.

**Maintenance rule for whoever (or whatever) edits this file:** only describe
the settled, current state of the code. If a change is made and then backed
out in the same session, it was never "the architecture" — don't record it
here. Historical pivots that were deliberately kept (like the prereq-graph
removal in §8) are fair game, because they explain a real decision an
interviewer might probe on.

## 1. What this is

A Chrome MV3 extension (no backend, no accounts) that injects UI into UCSC's
own MyUCSC pages: a persistent weekly-schedule builder with conflict
detection, and a per-course "what does this require" popover in class search
results. All state lives in the browser (IndexedDB + `chrome.storage.local`).
Two standalone packages (`prereq-parser`, `catalog-snapshot`) hold logic that
doesn't need a DOM and is reused across contexts.

The full product vision is `SlugPath.md`; the phased build plan is
`V1_FEATURES_AND_TECH.md`. This document is the "how it actually works"
companion to those — §9 calls out where current code has diverged from that
original plan.

## 2. Repo map

```
apps/extension/           the extension itself (content scripts, panels, storage)
  src/adapters/            DOM-scraping layer for external sites (MyUCSC)
  src/background/          MV3 service worker
  src/content/             content-script entry + DOM injection glue
  src/options/             extension options page (not a content script)
  src/prereq-graph/        prereq popover UI + its pure display-transform logic
  src/schedule/            schedule domain logic (conflicts) + panel UI
  src/storage/             Dexie DB, chrome.storage settings, Zustand bridge, hooks
  manifest.config.ts        MV3 manifest, generated via @crxjs/vite-plugin
packages/prereq-parser/   tokenizer + recursive-descent parser for catalog prereq prose
packages/catalog-snapshot/ course data types + query API + the bundled gzipped snapshot
scripts/                  one-off Node script that scrapes catalog.ucsc.edu to build the snapshot
docs/                     this file, docs/migrations.md, docs/HANDOFF.md (session log, not a reference doc)
```

Two workspace packages exist instead of one monolith because both bodies of
logic are useful without a DOM or a browser at all (`prereq-parser` is pure
string → AST; `catalog-snapshot` is pure data + lookups), and keeping them
dependency-free of the extension makes them independently unit-testable and,
in principle, reusable (e.g. by `scripts/build-catalog-snapshot.ts`, which
runs under plain Node, not a browser).

## 3. End-to-end: what happens when a student opens MyUCSC

This is the trace worth having cold for an interview — it touches almost
every subsystem.

1. **Manifest matches fire.** `manifest.config.ts` registers one
   `content_scripts` entry matching `https://my.ucsc.edu/*` and
   `https://pisa.ucsc.edu/*`, with `all_frames: true`. `src/content/index.tsx`
   runs in *every* frame on those hosts.
2. **Why two hosts, and why `all_frames`:** `my.ucsc.edu`'s "Main Content"
   iframe doesn't render class-search results itself — PeopleSoft navigates
   that iframe to a separate, UCSC-built Bootstrap page served from
   `pisa.ucsc.edu`. The content script has to run inside that nested iframe
   to ever see a results row, so `pisa.ucsc.edu` is in the match list and
   `all_frames: true` is set so the script loads inside the iframe at all
   (not just the top document).
3. **Top-frame gating.** Since the script now runs in multiple frames on the
   same page, `index.tsx` checks `window.top === window` before mounting any
   singleton UI (the `Panel` and `SchedulePanel`), so there's exactly one of
   each per page, not one per frame. The row-button injectors
   (`injectAddToPlanButtons`, `injectPrereqPopovers`) are *not* gated this
   way — they're no-ops wherever there's no results grid in that frame, and
   need to run inside the `pisa.ucsc.edu` frame specifically.
4. **Shadow DOM mount.** Each piece of injected UI gets its own
   `<div>` + `attachShadow({ mode: 'open' })` via `shadowMount.ts`, then a
   React root inside that shadow root. This is the one isolation primitive
   used everywhere a content script renders anything: it stops MyUCSC's page
   styles from bleeding into SlugPath's UI and stops SlugPath's own inline
   styles from leaking back out onto the host page. (There's no Tailwind or
   CSS framework in play today — see §9 — so this matters less for style
   *collision* than it would with a framework, but it still guarantees DOM
   isolation for injected buttons/popovers living inside a third-party page.)
5. **Waiting for results.** MyUCSC's results grid loads asynchronously (a
   PeopleSoft round-trip repaints the iframe). `adapters/myucsc.ts`'s
   `waitForResults()` uses a `MutationObserver` (not polling) with an 8s
   timeout, resolving as soon as a `[id^="rowpanel_"]` element exists.
6. **Parsing rows.** `parseSearchResults()` is the single place that knows
   the real result-row markup (Bootstrap `panel`/`row` divs, Font-Awesome
   icon classes as field anchors, `"N of M Enrolled"` seat text). It returns
   `{ section, rowEl }` pairs — a typed `Section` plus the live DOM element,
   so callers can both read structured data and inject something next to the
   row it came from. One row throwing never aborts the whole scan (each row
   is wrapped in try/catch).
7. **Row injection.** `scheduleInjection.ts` and `prereqPopoverInjection.tsx`
   both call `parseSearchResults`/`waitForResults` independently and append
   their own `<button>` into each row, marked with their own
   `data-slugpath-*` attribute so a `MutationObserver`-triggered re-scan
   (MyUCSC re-searching replaces the grid without a page navigation) never
   double-injects.
8. **"Add to plan" click** → `handleAddClick` reads the active plan id out of
   the Zustand settings store, resolves the section's *atomic group* (itself
   plus any linked sections — see §4.3), and writes each one to Dexie
   **sequentially**, not via `Promise.all` (two concurrent
   read-modify-write calls against the same plan document would race and the
   last writer would silently drop the other's section).
9. **"Prereqs" click** mounts a `PrereqPopover` for just that row's course:
   it lazily fetches+decompresses the bundled catalog snapshot (cached after
   first load), runs `parsePrereq` on that course's raw requirement text,
   and renders the resulting AST as inline text with taken/planned course
   chips. No recursion into the prerequisite courses' own prerequisites —
   deliberately shallow (see §8).
10. **Everything reactive.** The `SchedulePanel` (and anything else reading
    Dexie or settings) uses `dexie-react-hooks`' `useLiveQuery` / the
    Zustand store, so a write from step 8 re-renders the panel automatically
    with no manual message-passing between the row button and the panel.

## 4. Subsystems

### 4.1 Storage layer (`src/storage/`)

Two separate storage mechanisms, split by what they're for:

- **Dexie (IndexedDB)** — `db.ts` — for data that's structured, can grow
  large, and benefits from live queries: `plans`, `takenCourses`,
  `catalogCache` (the last one is declared in the schema but has no writer
  yet — catalog data today is the bundled snapshot only, see §4.6/§9).
- **`chrome.storage.local`** — `settingsStore.ts` — for the single small
  settings blob (`majorCode`, `catalogYear`, `calendarLinked`, `defaultTerm`,
  `activePlanId`). This API (not Dexie) is used here specifically because it
  natively syncs across extension contexts — content script, options page,
  popup — without any message-passing, which a lone IndexedDB instance per
  context would not give you for free.

**Why Dexie over raw `indexedDB`:** the raw API is callback/event-based and
verbose for exactly the two things this app actually needs — reactive
"re-render when this table changes" queries (`useLiveQuery`) and a readable
versioned-migration chain (`.version(n).stores(...)`, see below). Dexie
gives both for free; hand-rolling either on top of raw `indexedDB` would be
rebuilding a well-solved problem for no project-specific reason.

**Why a Zustand wrapper exists at all (`useSettingsStore.ts`):** `getSettings`/
`setSettings` alone would work, but every UI read would need its own
`useEffect` + local state to react to a change made in another context.
Zustand's `persist` middleware is pointed at a tiny custom
`PersistStorage` adapter that just forwards to `settingsStore.ts` (so there's
only one real owner of the storage key), and a `chrome.storage.onChanged`
listener calls `useSettingsStore.persist.rehydrate()` whenever another
context writes — e.g. a setting changed on the options page is reflected in
an already-open MyUCSC tab's panel without a reload.

**Why Zustand over Redux/Context for this:** the state being managed here is
one flat settings object with no reducers, no derived-state tree, and no
cross-slice logic — Redux's ceremony (actions, reducers, a store provider)
buys nothing a single `create()` call doesn't already give. Context was
ruled out too: it re-renders need a provider mounted in every context
(content script, options page, popup) and still doesn't solve
cross-context persistence/sync on its own — the `persist` middleware plus
the custom `chrome.storage`-backed adapter is the actual thing doing the
useful work here, and Zustand is the thinnest wrapper that has a
`persist` middleware slot to hang it on.

**Why plain async functions, not more hooks, for writes** (`planStore.ts`):
writes are one-shot (`createPlan`, `addSectionToPlan`, ...), and reads
already live in `hooks.ts` via `useLiveQuery`, which re-renders automatically
the moment a write function touches `db.plans` — so there's no need for a
write-side hook too.

**Migrations** (see `docs/migrations.md` before touching either schema):
Dexie schema changes are additive `this.version(n + 1).stores({...})` calls,
never edits to an already-shipped version block, with `.upgrade()` for row
transforms. Settings changes are additive fields merged under
`DEFAULT_SETTINGS` by default; a breaking settings shape change gets a
one-time "detect old shape, coerce, re-save" transform at the top of
`getSettings()`, not a version counter — considered overkill for one flat
settings object.

### 4.2 MyUCSC adapter (`src/adapters/myucsc.ts`)

The single file that owns every MyUCSC class-search DOM selector — a
deliberate isolation boundary, because MyUCSC is a third-party site SlugPath
doesn't control, and a DOM change there should mean touching exactly one
file, not hunting across the codebase.

Concretely it exports:
- `parseSearchResults(root)` — rows → `{ section, rowEl }[]`
- `waitForResults(root, opts?)` — `MutationObserver`-based wait, not polling
- `getCurrentTerm(root)` — **unverified**, no production caller uses it yet
  (flagged with a `ponytail:` comment rather than silently trusted)

Parsing is defensive by construction: every field getter (`parseDays`,
`parseClockToMinutes`, `parseMeetingTime`, `parseSeatsOpen`) returns an
empty/zero/null value on anything that doesn't match the expected shape
instead of throwing, and each row is wrapped in its own try/catch in
`parseSearchResults` — one malformed row degrades gracefully instead of
blanking the whole results list.

**This file was flatly wrong once, and that's worth knowing the shape of:**
an earlier version assumed classic PeopleSoft `<tr>`/`RECORDNAME_FIELDNAME$n`
markup and shipped with a fully synthetic (not captured) test fixture. It
looked done — full test suite, green CI — but had never actually been run
against the live site, and the real results grid turns out to be a
completely different, UCSC-built Bootstrap page on `pisa.ucsc.edu`. Neither
"Add to plan" nor "Prereqs" ever appeared in production until this was
caught and the selectors rewritten against a real captured row. The
takeaway generalized into a standing practice: **any adapter scraping a
real external site needs a verbatim-capture test fixture (DevTools → Copy
outer HTML), not a hand-written synthetic one** — a synthetic fixture can
pass forever while asserting the wrong thing entirely.

`linkedSectionKeys` (cross-listed / lecture+lab grouping) is deliberately
left unset by this adapter today — there's no verified real-DOM signal for
it yet, and the conflict/injection logic downstream (`resolveAtomicGroup`,
`sectionsConflict`) already degrades correctly to "treat sections
independently" when it's absent, so leaving it unset was preferred over
guessing at a mechanism.

### 4.3 Schedule builder (`src/schedule/`, `src/storage/planStore.ts`)

**Conflict detection** (`conflicts.ts`) is a plain pairwise overlap check:
two sections conflict if they share a day code and their `[startMinute,
endMinute)` ranges overlap by at least one minute — except sections that are
*linked* (cross-listed, or a lecture+lab pair), which are exempted from
conflicting with each other by definition, since a student is expected to
have both. `findConflicts` is the natural O(n²) pairwise scan over a plan's
section list; a real student's plan is a handful of sections, so this was
not worth optimizing.

**Atomic groups** (`resolveAtomicGroup` in `scheduleInjection.ts`): when a
section lists `linkedSectionKeys`, clicking "Add to plan" on it resolves the
whole group from that same results-page scan and adds every member — a
student can't attend a lecture without its linked discussion/lab. Writes
within a group are sequential `await`s in a `for` loop, not `Promise.all`,
specifically because `addSectionToPlan` is read-modify-write against one
Dexie document: concurrent writes would read the same stale `plan.sections`
array and the second write to finish would silently clobber the first's
section.

**`SchedulePanel.tsx`** is the always-on `position: fixed` panel on
`my.ucsc.edu` (mounted once, top frame only — see §3). It reads the active
plan via `usePlans()` + `settings.activePlanId`, renders a plan
switcher/CRUD toolbar, a grouped picked-sections list, and a Mon–Fri weekly
grid where each meeting pattern is positioned by simple linear
`minutes → pixels` math (`PIXELS_PER_MINUTE = 0.6`) rather than a grid/layout
library — the grid has one fixed geometry (7am–10pm, 5 columns), so a
dedicated scheduling-UI library would be solving a far more general problem
than this one actually has.

### 4.4 Prereq parser (`packages/prereq-parser/`)

A hand-written tokenizer + recursive-descent parser over UCSC catalog
"Requirements" prose, producing a `PrereqNode` AST
(`course | and | or | constraint`). This is the most algorithmically dense
part of the codebase and the one most worth being able to explain line by
line.

**Tokenizer** (`tokenizer.ts`): an ordered list of regexes tried at each
position (`sticky` (`/y`) regexes advancing a cursor, not a global scan).
Order matters a lot — multi-word phrases (`"concurrent enrollment in"`,
grade-minimum phrases, placement-exam-score phrases, "permission of
instructor" phrasings) are matched *before* the plain `and`/`or` keyword
matchers, because those plain matchers would otherwise consume a prefix of
the longer phrase. Anything unrecognized falls into a catch-all `other`
token (swallowed, ignorable) rather than aborting tokenization.

**Parser** (`parser.ts`) — the key design problem it solves is **precedence
in prose, not in a formal grammar**: `"X or Y, and Z or W"` means
`(X or Y) AND (Z or W)`, while `"X and Y, or Z and W"` means
`(X and Y) OR (Z and W)` — the same keywords, opposite binding, decided
entirely by *which separator has adjacent punctuation*. The parser's
approach:
1. `splitChunks` walks the token range at parenthesis-depth 0, splitting on
   AND/OR/comma/semicolon/period, and classifies each separator as
   **attached** (comma/semicolon directly adjacent to an explicit
   and/or keyword, or a bare semicolon/period defaulting to attached-AND) or
   **not attached** (a bare and/or keyword with no adjacent punctuation).
   Attached = outer/looser precedence boundary; not-attached = inner/tighter.
2. `buildTiers` groups chunks into tiers at the attached-separator
   boundaries.
3. `combineByPrecedence` folds a tier's chunks (or the tiers themselves) by
   grouping on AND boundaries and OR-joining within each group — used at
   both levels, since both are the same "AND of ORs" shape once precedence
   is already resolved.
4. **Fail-safe semantics are asymmetric by design:** inside an OR group, if
   *any* single member fails to parse, the **entire group fails** (not just
   that branch) — because silently dropping one OR-branch would
   misrepresent the requirement as stricter than it really is. Inside an AND
   group, a member that fails to parse is simply dropped, since an AND
   group's meaning is unaffected by a branch you can't understand (you just
   know less about one of the independent requirements, not a stronger
   requirement than reality).
5. Two narrative-stripping steps bound how much of the raw string is even
   considered: `LABEL_RE` finds where "Prerequisite(s):" actually starts
   (so leading narrative before the label is never parsed as logic), and
   `NARRATIVE_BOUNDARY_RE` truncates once prose crosses into eligibility
   narrative or antirequisite text (`"restricted to..."`,
   `"students who have already..."`, `"antirequisite:"`) — both exist
   because catalog prose routinely mentions course codes in a non-logic
   aside, and parsing past that boundary risks folding an unrelated mention
   (or, worse, an *anti*-requisite) into the AST as if it were a real
   AND/OR branch.
6. Anything that still doesn't parse returns `{ ok: false, raw }` — callers
   render the original raw string rather than guessing. There is **no
   partial/best-effort AST**: a prereq clause either parses as a trustworthy
   tree or falls back to raw text, never something in between that might be
   silently wrong.

This asymmetric fail-safe design (OR fails whole-group, AND drops the
branch) is the single idea in this codebase most worth defending in an
interview: it was a deliberate choice to bias toward *never understating* a
requirement, even at the cost of showing raw text more often than a looser
parser would.

### 4.5 Prereq popover (`src/prereq-graph/`)

Despite living in a directory still named `prereq-graph` (historical — see
§8), this is a *direct-prereqs-only* popover, not a graph: given one course
code, it shows only that course's own prerequisite logic as inline text, no
recursion into those courses' own prerequisites.

- `prereqText.ts` is a pure `PrereqNode → PrereqSegment` transform
  (course / group(AND|OR) / note), kept separate from `PrereqPopover.tsx`
  specifically so the AND/OR/constraint-unwrapping logic is unit-testable
  without rendering React at all.
- `catalogSnapshot.ts` lazily fetches and decompresses the bundled gzipped
  snapshot the first time it's needed and caches the resulting
  `{ index, snapshot }` in a module-level `Promise` so every popover mount
  reuses the same parsed data instead of re-fetching per row.
- `PrereqPopover.tsx` cross-references the parsed AST's course codes against
  the user's taken courses and planned sections (from Dexie, via the shared
  `hooks.ts`) to color each course chip (taken / planned / neither).

**Why `chrome.runtime.getURL` instead of the Vite `?url` import path
directly:** the snapshot is fetched from inside a content script, where a
relative/same-origin URL resolves against the *host page's* origin (e.g.
`https://my.ucsc.edu`), not the extension's — `chrome.runtime.getURL` is
what turns the Vite-emitted asset path into a real
`chrome-extension://<id>/...` URL that works regardless of which page's
content-script context is making the request.

**Why `DecompressionStream('gzip')` instead of a JS gzip library:** this
code only ever runs inside Chrome (it's a Chrome extension), and Chrome has
shipped `DecompressionStream` natively since M80 — pulling in a userland
gzip decoder would be solving an already-solved, already-shipped problem.

### 4.6 Catalog snapshot (`packages/catalog-snapshot/`, `scripts/`)

A build-time snapshot, not a live scrape: `scripts/build-catalog-snapshot.ts`
walks `catalog.ucsc.edu`'s subject index, fetches every subject page,
extracts `{ code, title, units, prereqRaw, geCodes, sourceUrl }` per course
via plain regex parsing (`scripts/catalog/parse.ts` — pure, fixture-tested,
no network I/O of its own), gzips the resulting JSON, and commits it to
`packages/catalog-snapshot/data/`. This runs manually at release time, not
in CI — fetching ~6,000 course pages isn't something that should happen on
every PR, and a flaky external site shouldn't be able to fail CI.

`fetchWithRetry` wraps each request with a fixed delay + fixed number of
retries (not exponential backoff/jitter) — intentionally the simplest thing
that's "polite" to the catalog server, since this is a manual, infrequent,
single-operator script, not a production request path under real load.

**Why regex scraping plus a narrow `htmlparser2` assist, not a full HTML
parser throughout:** `parse.ts` finds course-block boundaries and field
sections with plain regexes against the catalog's known, stable markup —
good enough because the shape of the page is simple and consistent, and a
full DOM parse would be solving a more general problem than "find this one
repeating block" actually requires. The one place a real parser earns its
keep is `html-text.ts`'s `htmlToText`, which uses `htmlparser2`'s `Parser`
in text-only mode purely to decode HTML entities and strip tags correctly
(e.g. `&amp;`, or a course code wrapped in an `<a>` link) — a regex-based
tag-stripper would mangle entities a real parser decodes for free. So it's
regex for structure (where the markup is predictable enough that a parser
is overkill) and a real parser for text content (where correctness around
entities actually matters).

The package itself (`src/index.ts`, `query.ts`, `types.ts`) only exports
types and a query API (`createCatalogIndex` → `getCourse`/`search`/
`coursesSatisfying`) over an already-loaded `CatalogSnapshot` — it does not
own fetching/decoding the gzip, because that's an extension-runtime concern
(needs `chrome.runtime.getURL` and `DecompressionStream`, see §4.5), not
something a plain Node-or-browser-agnostic package should assume.

`termsOffered` is always `[]` today and `sourceUrl` is optional — the
catalog source page doesn't expose structured term-offered data at all
(permanently empty, not a TODO), and `sourceUrl` postdates the
currently-bundled snapshot's generation, so existing cached data won't have
it.

### 4.7 Options page (`src/options/`)

A plain extension page (not a content script), so it renders with no shadow
DOM and no content-script constraints — it's `createRoot` straight into
`#root` the same as any ordinary Vite+React app. Today it's a single major
picker backed by a hardcoded three-item list and `useSettings()`; it's
explicitly marked as a placeholder pending a catalog-driven major list.

### 4.8 Background service worker (`src/background/index.ts`)

Intentionally minimal: load/`onInstalled`/`onStartup` console logging only,
no `chrome.alarms`, no message routing. The comment in the file is explicit
about why: `setInterval` would silently stop the moment the MV3 service
worker suspends (~30s idle), and the correct periodic primitive
(`chrome.alarms`) needs a permission not in the v1 permission list — so
rather than ship a background task that silently stops working, there isn't
one yet.

## 5. Build & tooling

- **pnpm workspace** (`pnpm-workspace.yaml`): `apps/*` + `packages/*`,
  cross-referenced via `workspace:*` so the extension always builds against
  the local package source, not a published version. Chosen over npm/yarn
  workspaces mainly for pnpm's stricter, deduplicated `node_modules` (a
  package can't accidentally resolve a transitive dependency it never
  declared) — not load-bearing for a project this size, but the cheaper
  default given no reason to pick anything else.
- **Vite + `@crxjs/vite-plugin`** (`vite.config.ts`, `manifest.config.ts`):
  generates the MV3 manifest from a typed `defineManifest()` call (so e.g.
  the catalog snapshot version can be read from `version.json` and embedded
  into `version_name` directly in TypeScript) and handles MV3-specific build
  concerns (content-script chunking, `web_accessible_resources`) that a
  generic bundler doesn't know about. **Over Webpack specifically:** MV3
  extension builds have real, non-obvious constraints (content-script
  chunking, `web_accessible_resources` generation, manifest-driven multi-entry
  output) that Webpack has no first-class concept of — `@crxjs/vite-plugin`
  exists purpose-built for exactly this, so using it avoids hand-rolling that
  MV3 glue in Webpack config. The tradeoff actually bit once: §5's
  single-`content_scripts`-entry gotcha below is a `@crxjs`-specific quirk,
  not a problem a from-scratch Webpack config would have had — the
  convenience isn't free, but still net cheaper than building the MV3 glue
  by hand.
- **React 18**, function components + hooks only, no class components and no
  state-management library beyond Zustand (§4.1) for the one piece of shared
  cross-context state. No stated alternative was seriously evaluated — React
  is the default for an extension doing nontrivial injected UI, and nothing
  about this project's requirements pushes toward e.g. a signals-based
  framework (Svelte/Solid) or vanilla DOM.
- **One `content_scripts` entry, not one per host.** `@crxjs/vite-plugin`
  tracks the `web_accessible_resources` match list for a content script
  keyed by its *source filename*. Two separate `content_scripts` entries
  that both point at `src/content/index.tsx` (one per hostname) would
  silently cause the second to overwrite the first's generated
  `web_accessible_resources` grant — breaking the dynamic-import chunk load
  (and therefore the entire content script) on whichever host lost. The fix
  baked into the manifest is structural, not a workaround: one entry
  covering every matched host, `all_frames: true`, with per-host/per-frame
  behavior handled in `index.tsx` via `location.hostname`/`window.top`
  checks instead of a second manifest entry.
- **TypeScript strict mode** everywhere (`tsconfig.base.json`:
  `strict: true`, `noUncheckedIndexedAccess: true`), which is why so much of
  the parser/adapter code explicitly null-checks array/regex-match access
  rather than asserting non-null.
- **ESLint** (`eslint.config.js`): `typescript-eslint` recommended +
  `eslint-plugin-react-hooks` recommended, with environment globals split
  per directory (service-worker globals only for `background/`, browser
  globals for the rest of the extension, Node globals for `scripts/`) so
  each context's actual global scope is what gets linted against.
- **CI** (`.github/workflows/ci.yml`): lint → typecheck → test on every PR
  and on push to `main`. No build/package step in CI.
- **Release** (`.github/workflows/release.yml`): on a `v*` tag, builds and
  zips `apps/extension/dist` as a release artifact — no Chrome Web Store
  publish automation yet, just the artifact.

## 6. Testing strategy

- **Vitest**, single root config (`vitest.config.ts`) covering
  `apps/**`, `packages/**`, and `scripts/**` test files — one test runner
  for the whole workspace rather than per-package configs.
- **DOM-touching code** (adapters, injection) is tested against **real,
  verbatim-captured HTML fixtures** (DevTools → Copy outer HTML), not
  hand-written synthetic markup — this is a hard-learned rule (§4.2's
  `myucsc.ts` history), not a style preference.
- **Pure logic** (parser, `conflicts.ts`, `prereqText.ts`) is tested directly
  with plain unit tests / fixture tables — no DOM, no mocking needed.
- **Dexie-touching code** uses `fake-indexeddb` so `db.test.ts` and
  `planStore.test.ts` run under plain Node/Vitest with no real browser.
- **`chrome.*` APIs** are stubbed with a small hand-rolled mock
  (`testChromeMock.ts`'s `installChromeStorageMock`) rather than a general
  chrome-mocking library — the surface actually used
  (`storage.local.get/set/remove`, `onChanged`) is small enough that a
  dependency wasn't worth it.
- **Manual/live verification**: for anything involving real DOM injection
  against the live sites, ad hoc Playwright scripts
  (`launchPersistentContext` + `--load-extension`) against the real
  `my.ucsc.edu`/`pisa.ucsc.edu` have been the practice before trusting a
  change — unit tests alone have not been treated as sufficient proof for
  DOM-injection changes on this project. No permanent Playwright suite
  exists yet; this has been throwaway driver scripts per session.

## 7. Key design decisions (quick-reference)

| Decision | Why | Alternative considered / rejected |
|---|---|---|
| Shadow DOM for every injected UI root | Isolate styles both directions against an unknown host page | None seriously — treated as non-negotiable given the injection surface |
| MyUCSC selectors isolated to one file (`adapters/myucsc.ts`) | A third-party site's DOM changes without notice; contain the blast radius to one file | Inlining selectors at each call site |
| Prereq prose → AST or raw-text fallback, no partial AST | Never silently misrepresent a requirement as weaker/stronger than it is | Best-effort partial parsing |
| OR-group fails whole group on one bad member; AND-group drops the bad member | Bias toward never *understating* a requirement | Dropping failed members in both cases (understates OR requirements) |
| Bundled, build-time catalog snapshot (gzip, committed to repo) | ~6,000-page live scrape is too slow/fragile for first paint, and shouldn't run in CI | Fetch-on-demand per course page only |
| `chrome.storage.local` for settings, Dexie for everything else | Settings need cross-context sync with no message-passing; Dexie gives live queries for larger structured data | One storage mechanism for everything |
| Zustand wrapper around settings, not raw `chrome.storage` calls everywhere | React components need to re-render on a setting changed in another context | Manual `useEffect`/polling per consumer |
| Sequential (not `Promise.all`) writes for atomic/linked sections | `addSectionToPlan` is read-modify-write against one Dexie doc; concurrent writes race and drop data | Parallel writes |
| Simple linear-math weekly grid, not a scheduling-UI library | Fixed, small geometry (7am–10pm, 5 columns) — a library would solve a more general problem than exists here | React Big Calendar / similar |
| `DecompressionStream('gzip')` native API | Chrome-only extension; native API has existed since Chrome M80 | A userland gzip JS library |
| Fixed-delay retry in the catalog scraper, not exponential backoff | Manual, infrequent, single-operator script — simplicity over robustness it doesn't need | Exponential backoff + jitter |
| One `content_scripts` manifest entry with `all_frames: true`, host/frame branching in code | `@crxjs/vite-plugin`'s per-filename `web_accessible_resources` tracking breaks with two entries on the same file | Two manifest entries, one per host |

## 8. Settled history: things tried and deliberately removed

**The catalog-page prerequisite graph** (React Flow + `dagre`, rendering a
full navigable upstream/downstream DAG on `catalog.ucsc.edu` course pages)
was built, then fully deleted once the current popover shipped. This is
*not* an in-progress reversal — it's a closed decision kept on `main` — and
worth knowing the shape of because an interviewer may well ask "why isn't
there a graph view":

- The graph covered "explore the whole prerequisite chain," but the
  popover's narrower "do I have what this needs" view covered the actual
  use case students hit while scanning class search results, without the
  graph's own unresolved layout bugs (node/row overlap when a node's
  height was undercounted by `dagre`; long swooping bezier edges between
  far-apart nodes, later fixed by switching edge type to `smoothstep` before
  the feature was cut entirely).
- Deleting it also deleted its two dependencies (`@xyflow/react`,
  `@dagrejs/dagre`) and the `catalog.ucsc.edu` DOM adapter
  (`adapters/catalog.ts`, which had no other caller) — shrinking the
  content-script bundle from roughly 268KB to roughly 20KB.
- A real, measured limitation was *found but deliberately left unfixed* in
  the graph before it was cut, and the same limitation still applies to the
  popover today: `parsePrereq` fully fails on a meaningful fraction of
  bundled courses' raw prereq text (placement-exam-score phrasings were one
  recurring cause, fixed; others remain), so some real prerequisite
  relationships render as raw text rather than structured chips. A rejected
  idea for the graph (scanning unparsed text for a mention of the target
  course code as a fallback "unlocks" signal) was rejected because it's
  unsound: catalog prose sometimes names a course as an explicit
  *anti*-requisite ("cannot receive credit for this course and X"), and a
  blind text match can't tell the difference — exactly the false-positive
  class `NARRATIVE_BOUNDARY_RE` already exists to prevent elsewhere in the
  parser. The real fix is extending the parser's grammar to cover more
  phrasings, which is fully decoupled from the UI layer.

## 9. Where current code diverges from `V1_FEATURES_AND_TECH.md`

The spec document is the original plan; it is **not** kept in sync with
implementation and shouldn't be read as current state. As of this writing:

- **Not implemented yet:** GE requirement tracker (inline badges, standalone
  tracker page, double-dip detection), Google Calendar export, `.ics` export,
  "mark course taken" UI, catalog-driven major list (the options page major
  picker is a hardcoded 3-item placeholder).
- **Built, then removed:** the React Flow + `dagre` prerequisite graph (see
  §8) — the spec still describes it as a planned v1 feature; it was replaced
  by the narrower prereq popover.
- **Never added:** Tailwind CSS and `lucide-react`, despite being named in
  the tech stack — there's no styling framework in use; all injected UI uses
  inline `style` objects.
- **`catalogCache` Dexie table exists in the schema but has no writer** — the
  "on-demand fetch for a course not in the bundled snapshot" behavior the
  spec describes isn't implemented; only the bundled snapshot is consulted.
- **`getCurrentTerm`** exists in the MyUCSC adapter but has no caller yet —
  i.e., `defaultTerm`/term-scoping behavior described in the spec isn't wired
  up end-to-end.

## 10. Open/known issues as of this writing

- **`Panel` and `SchedulePanel` both mount at `position: fixed; top: 16px;
  right: 16px`** on `my.ucsc.edu`'s top frame (`Panel.tsx`'s inline style vs.
  the `scheduleHost.style.cssText` set in `content/index.tsx`). The
  later-mounted, larger `SchedulePanel` will sit on top of and fully
  obscure the small `Panel` ("Hello SlugPath" stub). This is a real,
  reproducible layout bug on `main` today, not a hypothetical — worth fixing
  by moving one of the two to a different screen corner, or merging them
  into a single mount point, whichever lands first.
- **`linkedSectionKeys` has no production source** (§4.2) — cross-listed/
  lecture+lab grouping degrades to "treat every section independently"
  until a real DOM signal for it is found and wired into
  `parseSearchResults`.
- **`getCurrentTerm` is unverified against the live site** — don't trust it
  without re-checking against a real captured page first.

## 11. Quick command reference

```
pnpm dev             # vite dev server for the extension (apps/extension)
pnpm build           # production build -> apps/extension/dist
pnpm build:catalog   # re-scrape catalog.ucsc.edu, regenerate the bundled snapshot (manual, slow)
pnpm lint            # eslint .
pnpm typecheck       # per-package tsc --noEmit + scripts/tsconfig.json
pnpm test            # vitest run, whole workspace
```

Loading the built extension: `chrome://extensions` → Developer mode → Load
unpacked → `apps/extension/dist`. After any rebuild, prefer `rm -rf
apps/extension/dist && pnpm build`, then remove and re-load the unpacked
extension rather than just clicking "reload" — a stale loaded extension
against a half-rebuilt `dist/` produces confusing `ERR_FILE_NOT_FOUND`/
dynamic-import failures that look like a real bug but aren't.
