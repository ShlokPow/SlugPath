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
results. All state lives in the browser, in `chrome.storage.local`.
Two standalone packages (`prereq-parser`, `catalog-snapshot`) hold logic that
doesn't need a DOM and is reused across contexts.

The full product vision is `SlugPath.md`; the phased build plan is
`V1_FEATURES_AND_TECH.md`. This document is the "how it actually works"
companion to those — §9 calls out where current code has diverged from that
original plan.

## 2. Repo map

```
apps/extension/           the extension itself (content scripts, panels, storage)
  src/adapters/            DOM-scraping layer for external sites (MyUCSC, Degree Progress Report)
  src/background/          MV3 service worker
  src/content/             content-script entry + DOM injection glue
  src/export/              plan -> calendar events, .ics rendering, Google Calendar API
  src/ge-tracker/          GE progress logic + the standalone tracker page
  src/options/             extension options page (not a content script)
  src/prereq-graph/        prereq popover UI + its pure display-transform logic
  src/schedule/            schedule domain logic (conflicts) + panel UI
  src/storage/             chrome.storage collections + settings, Zustand bridge, hooks
  manifest.config.ts        MV3 manifest, generated via @crxjs/vite-plugin
packages/prereq-parser/   tokenizer + recursive-descent parser for catalog prereq prose
packages/catalog-snapshot/ course data types + query API + the bundled gzipped snapshot + the GE requirements dataset
scripts/                  one-off Node script that scrapes catalog.ucsc.edu to build the snapshot
docs/                     this file, migrations.md, privacy-policy.md (Web Store requirement), HANDOFF.md (session log, not a reference doc)
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
7. **Row injection.** `scheduleInjection.ts`, `prereqPopoverInjection.tsx`,
   and `geBadgeInjection.ts` (§4.7) each independently call
   `parseSearchResults`/`waitForResults` and append their own
   button/badges into each row, marked with their own `data-slugpath-*`
   attribute so a `MutationObserver`-triggered re-scan (MyUCSC re-searching
   replaces the grid without a page navigation) never double-injects.
8. **"Add to plan" click** → `handleAddClick` reads the active plan id out of
   the Zustand settings store, resolves the section's *atomic group* (itself
   plus any linked sections — see §4.3), and writes each one to `chrome.storage.local`
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
    plans or settings) subscribes to `chrome.storage.onChanged` (via
    `hooks.ts` / the Zustand store), so a write from step 8 — made in the
    `pisa.ucsc.edu` results iframe — re-renders the `my.ucsc.edu` panel
    automatically with no manual message-passing.

## 4. Subsystems

### 4.1 Storage layer (`src/storage/`)

Everything persisted lives in **`chrome.storage.local`**:

- `db.ts` — two keyed collections, `plans` (by `id`) and `takenCourses` (by
  `courseCode`), each stored as one `{ [key]: item }` object under its own
  storage key and rewritten whole on every write. `Collection` exposes a
  small table-like API (`get`/`toArray`/`put`/`add`/`update`/`delete`/
  `clear`) so call sites stay one-liners.
- `settingsStore.ts` — the single small settings blob (`majorCode`,
  `catalogYear`, `calendarLinked`, `defaultTerm`, `activePlanId`, ...).

**Why not IndexedDB:** a content script's IndexedDB belongs to the *host
page's* origin, not the extension's. SlugPath's content script runs in the
`my.ucsc.edu` top frame (panel), the `pisa.ucsc.edu` results iframe ("Add to
plan" buttons) and the extension's own pages (options, GE tracker) — three
origins, so IndexedDB would be three separate databases that can't see each
other's plans. `chrome.storage.local` is one store shared by every extension
context, and `chrome.storage.onChanged` fires in all of them, which is what
makes the UI live across frames without message-passing. Data is small (a
few plans of a few sections each), far under the 10MB quota.

**Trade-off accepted:** whole-collection rewrites mean two contexts writing
the same collection at the same instant are last-write-wins. In practice
writes are user clicks in one place at a time; split into per-item storage
keys if that ever bites.

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
already live in `hooks.ts` (`usePlans`/`useTakenCourses`, an initial read
plus an `onChanged` subscription), which re-render automatically the moment a
write function touches `db.plans` — so there's no need for a write-side hook
too.

**Migrations** (see `docs/migrations.md` before touching either schema):
collections and settings follow one rule, with no version counter. Additive
fields need nothing: settings are merged under `DEFAULT_SETTINGS`, and a
missing collection field is treated as its default at the read site. A
breaking shape change gets a one-time "detect old shape, coerce, re-save"
transform, in `getSettings()` or `Collection`'s read path.

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

**Silence is the failure mode this adapter has, so there's an explicit
fallback for it.** Every field getter degrades instead of throwing, which
means a MyUCSC redesign shows up as rows on the page, zero parsed, no buttons
injected, and nothing a student can see. `countResultRows()` (also here, with
the other selectors) is the denominator: rows present but none parsed is the
one reliable "layout changed" signal, and `content/layoutWarning.ts` turns it
into a single dismissible banner. Checked in `scheduleInjection.ts`'s
re-scan only — all three row injectors read the same
`parseSearchResults` output, so they fail together. Deliberately *not*
triggered by `waitForResults` timing out: that's the normal case on every
MyUCSC page that isn't a class search, and bannering it would cry wolf
site-wide.

`linkedSectionKeys` (cross-listed / lecture+lab grouping) is deliberately
left unset by this adapter today — there's no verified real-DOM signal for
it yet, and the conflict/injection logic downstream (`resolveAtomicGroup`,
`sectionsConflict`) already degrades correctly to "treat sections
independently" when it's absent, so leaving it unset was preferred over
guessing at a mechanism.

### 4.3 Schedule builder (`src/schedule/`, `src/storage/planStore.ts`)

**Day codes** are the adapter's (`myucsc.ts`): `M`, `T`, `W`, `Th`, `F`.
Everything downstream (conflicts, the panel's weekly grid, calendar export)
compares against those codes. The grid's `DAYS` pairs each code with its
column label ("Tue" ↔ `T`), so a label is never used as a code.

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
specifically because `addSectionToPlan` is read-modify-write against the
`plans` collection: concurrent writes would read the same stale `plan.sections`
array and the second write to finish would silently clobber the first's
section.

**A dangling `activePlanId` self-heals at the one place it's written from.**
`settings.activePlanId` has no referential integrity with the `plans`
collection. The panel's own Delete re-points it, but any other removal (a
cleared storage key, a future delete path) leaves it pointing at nothing. Every *read* site (`SchedulePanel`, `GETrackerPage`, `Panel`,
`geBadgeInjection`) already tolerates this via `plans.find(...)` returning
`undefined`. `handleAddClick` in `scheduleInjection.ts` is the one *write*
path, so it's the one place that checks `db.plans.get(activePlanId)` before
writing: a miss clears the dangling id (which every read site then renders
as "no plan selected") and alerts the student instead of letting the write
throw into a content-script's `console.error`, invisible to anyone but a
developer.

**`SchedulePanel.tsx`** is the always-on `position: fixed` panel on
`my.ucsc.edu` (mounted once, top frame only — see §3). It reads the active
plan via `usePlans()` + `settings.activePlanId`, renders a plan
switcher/CRUD toolbar (it `flex-wrap`s, so Rename/Duplicate/Delete drop to a
second line in the fixed 320px width instead of overflowing), a grouped
picked-sections list, and a Mon–Fri weekly grid (`WeeklyGrid`, columns keyed
by the day codes above) where each meeting pattern is positioned by simple linear
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
  the user's taken courses and planned sections (via the shared
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

### 4.7 GE requirement tracker (`src/ge-tracker/`, `packages/catalog-snapshot/src/geRequirements.ts`, `src/adapters/degreeProgress.ts`)

Three separate UI surfaces — inline MyUCSC row badges, an always-on
persistent widget, and a standalone tracker page — all read from one pure
computation, so "is this GE satisfied" can never drift between surfaces.

**The dataset** (`geRequirements.ts`): 15 leaf GE codes, 13 of them flat
(`CC`, `ER`, `IM`, `MF`, `SI`, `SR`, `TA`, `C`, `DC`) and 6 grouped into two
3-way choice groups (`PE-E`/`PE-H`/`PE-T` "Perspectives",
`PR-E`/`PR-C`/`PR-S` "Practice") that each collapse to one requirement slot
— satisfying *any one* member of a group fills that group's whole slot, so
15 leaf codes become 11 real requirement slots. **DC is a structural
exception**: every other code is a general-catalog tag readable off
`CourseSnapshot.geCodes`, but DC is satisfied by 1–3 courses *defined by the
student's specific major* (each major's own advising sheet, not a catalog
tag) — so `DC_COURSES_BY_MAJOR` ships empty rather than guessed, keyed by
major code for whenever real per-major data is sourced.

**The pure core** (`ge-tracker/geProgress.ts`) — no DOM/storage access, same
pure/impure split used throughout this codebase (`prereqText.ts`,
`conflicts.ts`):
- `computeGEProgress` — for each requirement code, which taken/planned
  courses credit it (via catalog `geCodes`, or the `DC_COURSES_BY_MAJOR`
  lookup for DC specifically).
- `computeGESlots` — collapses progress into the 11 real slots (grouping by
  `group`), optionally folding in `confirmedSlotIds` for a GE the Degree
  Progress Report reported satisfied with no specific course attached (see
  below) — that input can only turn a slot satisfied, never un-satisfy one
  course-crediting already proved.
- `findMultiGECourses` — courses credited toward 2+ GEs at once, the set the
  assignment picker (below) operates on. **Deliberately computed from
  progress *without* assignments applied** — if it used post-assignment
  progress, assigning a course to one GE would make it look single-GE and
  the very picker that set the assignment would disappear.
- `applyGEAssignment` — pure reducer for the "pick a primary GE" picker;
  assigning `''` (falsy) removes the assignment rather than setting it,
  which is the "count toward all" default.

**Three UI surfaces, one source of truth:**
- **Inline MyUCSC row badges** (`content/geBadgeInjection.ts`) — same
  injection pattern as `scheduleInjection.ts`/`prereqPopoverInjection.tsx`
  (parse rows, idempotent re-scan on mutation). A code already satisfied by
  a taken/planned course renders as a filled chip instead of outlined, so
  double-dipping is visible while scanning search results, not just on the
  tracker page.
- **The persistent `Panel.tsx` widget** — repurposed from an inert "Hello
  SlugPath" placeholder into a collapsible GE-summary box, shown on every
  matched MyUCSC page via the same `computeGESlots` call the tracker page
  uses. Lives at `position: fixed; bottom: 16px; right: 16px` —
  specifically *bottom*-right, not top-right: `SchedulePanel` already claims
  `top: 16px; right: 16px` on `my.ucsc.edu`, and two `position: fixed`
  elements at the same corner silently stack (the later-mounted, larger one
  wins and fully hides the other) — this was a real bug on `main` before
  this merge, now avoided by giving each a distinct corner.
- **The standalone tracker page** (`ge-tracker/GETrackerPage.tsx`) — a full
  extension page (own `index.html`/`index.tsx`, no shadow DOM needed),
  opened via `chrome.action.onClicked` → `chrome.tabs.create()`
  (`background/index.ts`), not `action.default_popup`. **Why a tab instead
  of a popup dropdown:** the tracker needs real page real estate (a full
  progress list plus a multi-row assignment picker) that a small popup
  can't comfortably hold — `manifest.config.ts` explicitly sets `action: {}`
  with no `default_popup` for this reason, and no icon assets exist yet
  either (noted inline as a later polish item).
  - **Build gotcha hit shipping this page**: `@crxjs/vite-plugin` only
    auto-discovers HTML referenced by specific manifest keys
    (`options_page`, `action.default_popup`, `devtools_page`, `sandbox.pages`,
    `side_panel.default_path`, `chrome_url_overrides`) — a page opened only
    via `chrome.tabs.create` isn't one of those, so the build silently
    produced no `dist/src/ge-tracker/index.html` at all until an explicit
    `build.rollupOptions.input` entry was added to `vite.config.ts`
    (`vite.config.ts`'s own comment flags this for the next page like it).
    Verify any future `chrome.tabs.create`-opened page actually lands in
    `dist/` after a build — the manifest alone won't tell you it's missing.

**Importing real data: the MyUCSC Degree Progress Report**
(`adapters/degreeProgress.ts` + `content/degreeProgressImport.ts`) — the
automatic way taken-course data enters the system; the options page's manual
editor (§4.9) is the other. Two load-bearing
facts about the source page shaped this adapter:
- **It's genuine classic PeopleSoft** (`win0div*`, `ACE_*`,
  `submitAction_win0(...)` postback links) — unlike MyUCSC class search,
  which turned out to be a custom non-PeopleSoft Bootstrap page on
  `pisa.ucsc.edu` (§4.2). The lesson generalized: don't assume every MyUCSC
  page shares one rendering approach — check the real URL and markup
  per page, which is exactly why this needed its own adapter file rather
  than extending `myucsc.ts`.
- **A PeopleSoft collapsible section's course-level detail doesn't exist in
  the DOM until a user has actually expanded it** — a real server
  round-trip (`submitAction_win0`), not a CSS toggle. Rather than script 11
  sequential expand-and-wait postbacks, `parseDegreeProgressGE` just reads
  whatever's currently in the DOM: an expanded category yields real
  per-course credit (written to `db.takenCourses`, only for a course whose
  status icon reads exactly `"Taken"` — the only status ever captured; no
  model exists for a DPR-sourced "planned" course either, since this
  extension's "planned" specifically means "in a Plan's sections", which
  needs a MyUCSC section DPR doesn't expose); a still-collapsed category
  just marks its GE code satisfied with no specific course attached, fed
  into `computeGESlots` via the additive `Settings.degreeProgressGECodes` /
  `degreeProgressImportedAt` fields.
- **DC is skipped by this importer too**, for the same reason it's unsourced
  in the dataset: its row has no satisfied icon at all, because the page's
  own text says DC is reported per-major in a different section ("Upper-
  Division Requirements") this adapter doesn't touch.
- No manifest change was needed for the importer — the DPR's real URL
  confirmed it renders under `my.ucsc.edu` itself (already a matched host),
  unlike class search which needed `pisa.ucsc.edu` added specifically.

### 4.8 Calendar export (`src/export/`, `src/schedule/ExportControls.tsx`)

A plan becomes recurring calendar events through one pure model, rendered
two ways — a downloaded `.ics` file (no auth) and POSTs to the Google
Calendar API — so the two paths can't disagree about which meetings a plan
contains.

**The pure core** (`export/events.ts`): `planToEvents(plan, range)` emits one
event per meeting pattern per section (a split lecture/lab pattern is two
events), with the weekly recurrence expressed as BYDAY codes plus an
occurrence `count`. Same pure/impure split as `conflicts.ts`/`geProgress.ts`:
no DOM, no storage, no `chrome.*`.

Three decisions inside it are worth knowing:

- **The term's date range is a parameter, not bundled data.** The spec's
  Phase 6 called for "bundled academic-calendar dates by term"; UCSC's real
  quarter start/end dates aren't in the catalog snapshot, and a guessed range
  silently produces events that recur for the wrong number of weeks — so the
  export UI asks for the first and last day of instruction instead (native
  `<input type="date">`, two fields). Same "don't ship guessed external data"
  call as `DC_COURSES_BY_MAJOR` (§4.7).
- **`COUNT`, not `UNTIL`.** RFC 5545 requires `UNTIL` to be a UTC instant
  whenever `DTSTART` isn't floating, which would pull DST offset math into
  this file; every occurrence date is already enumerated here, so the exact
  count is free and timezone-proof.
- **Local wall-clock timestamps plus an explicit zone**, never a UTC instant.
  `events.ts` emits `20260928T100000` and both renderers attach
  `UCSC_TIME_ZONE` (`America/Los_Angeles`) — a `DTSTART;TZID=…` plus a static
  `VTIMEZONE` block in the `.ics`, the API's own `timeZone` field for Google.
  That's what keeps a 10am class at 10am on both sides of the November DST
  change a UCSC fall quarter straddles. *Floating* times (no zone at all)
  were tried first and rejected on evidence: they resolve to the reader's
  local zone, which silently shifts every meeting for anyone importing from
  outside Pacific time, and some importers expand a floating recurrence in
  UTC, which moves the post-DST half of the quarter by an hour (observed
  while round-tripping real output through `node-ical`).

**`.ics` rendering** (`export/ics.ts`) is hand-rolled rather than using the
`ics` npm package the spec named: the needed subset is a VCALENDAR header,
one VEVENT per meeting with an RRULE, RFC 5545 text escaping and 75-octet
line folding — about 40 lines, which no dependency can beat. UIDs are
deterministic (`summary` + start stamp), so re-importing a regenerated file
updates the same events instead of duplicating them. The fold is
character-based, not octet-based, with a `ponytail:` comment on the ceiling.

**Google Calendar** (`export/googleCalendar.ts` + `export/messages.ts` +
`background/index.ts`): `chrome.identity` is **not exposed to content
scripts**, and the export UI lives in the `SchedulePanel` (a content script)
— so the token and every API call live in the service worker, reached through
one small typed message contract (`slugpath:calendar-link` / `-unlink` /
`-export`). The options page uses those same messages rather than calling
`chrome.identity` directly, so the token lifecycle has exactly one owner.
- POSTs are **sequential, and per-event failures are collected rather than
  aborting the run**: there's no transactional batch endpoint to get
  atomicity from, so a partially-exported plan the student can retry beats
  all-or-nothing. `ExportResult.failed` carries each failure's *index* in the
  submitted array, so the panel's "Retry N failed" button re-sends exactly
  those events — re-POSTing a successful one would duplicate it, since the
  API has no upsert.
- **Sign-in uses `chrome.identity.launchWebAuthFlow`, not `getAuthToken`.**
  Google rejects `getAuthToken` for unverified Chrome-extension OAuth clients
  ("Error 400: invalid_request — Custom URI scheme is not supported on Chrome
  apps"), and non-Chrome Chromium browsers don't implement it. The worker
  runs the implicit flow (`response_type=token`) against
  `chrome.identity.getRedirectURL()` and caches `{token, expiresAt}` in
  `chrome.storage.session`, which survives worker restarts and clears with
  the browser. There's no refresh token, so after about an hour the next
  export re-opens Google's (usually one-click) consent window. Unlink just
  drops the cached token.
- A 401 clears the cached token and retries once with a fresh one, once per
  export run.
- **The OAuth client id is build-time config, not a committed credential**:
  `manifest.config.ts` reads `SLUGPATH_OAUTH_CLIENT_ID` (wired to a repo
  secret in `release.yml`) and otherwise ships an obvious
  `REPLACE_ME.apps.googleusercontent.com`, so an unconfigured build fails
  loudly at sign-in instead of looking configured. `||` not `??` there: an
  unset GitHub Actions secret arrives as an empty string. `authToken()`
  checks for the placeholder itself and throws a message naming
  `SLUGPATH_OAUTH_CLIENT_ID`, since Chrome's own error is an opaque
  "invalid_client". The client is a Google Cloud OAuth client of type **"Web
  application"** whose authorized redirect URI is
  `https://<extension-id>.chromiumapp.org/`. The manifest has no `key`, so an
  unpacked build's ID comes from its load path: load it from a different
  folder and the redirect URI stops matching.
- **Every click gives feedback.** `ExportControls`' buttons are never
  disabled for "nothing to export" (a disabled button with the panel's
  inline styling looks clickable and silently no-ops); clicking shows
  `exportBlocker()`'s reason instead — dates missing, range inverted, empty
  plan, or no meeting times in range. That reason is the same text as the
  idle hint, so blocked clicks and failures render the status line bold red;
  without that, a blocked click re-sets identical grey text and still reads as
  "nothing happened". Editing either date clears the status. A
  `window.confirm` that returns false (cancelled, or dialogs suppressed) sets a
  status too, and `messages.ts` maps an unanswered `sendMessage`
  (`undefined`) to an error.

### 4.9 Options page (`src/options/`)

A plain extension page (not a content script), so it renders with no shadow
DOM and no content-script constraints — it's `createRoot` straight into
`#root` the same as any ordinary Vite+React app. Three sections:

- **Degree**: a major picker (hardcoded three-item list) and a catalog-year
  picker (hardcoded one-item list, since only one catalog snapshot is
  bundled), both writing straight to `useSettings()`. Both lists are
  explicitly marked as placeholders — the major list pending a catalog-driven
  list, the year list pending a second bundled catalog year to choose between.
- **Google Calendar**: link status plus link/unlink buttons, which go through
  the background worker's messages (§4.8) rather than calling
  `chrome.identity` here, even though an extension page could — one owner of
  the token lifecycle.
- **Courses already taken**: the manual editor for `db.takenCourses`. Until
  this existed, taken courses could only enter the system via the Degree
  Progress Report importer (§4.7). Writes go through
  `storage/takenCourseStore.ts`, which normalizes the code with the same
  `normalizeCode` the prereq popover and GE lookups use — and the DPR importer
  was switched to that same function in the process, since two writers with
  different normalization would key `"CSE 12"` and `"CSE12"` as separate rows
  for one course. Codes are stored normalized (`CSE101`) and the space is
  re-inserted for display only.

### 4.10 Background service worker (`src/background/index.ts`)

Mostly intentionally minimal: load/`onInstalled`/`onStartup` console logging
only, no `chrome.alarms`. The comment in the file is explicit about why:
`setInterval` would silently stop the moment the MV3 service worker
suspends (~30s idle), and the correct periodic primitive (`chrome.alarms`)
needs a permission not in the v1 permission list — so rather than ship a
background task that silently stops working, there isn't one yet.

Its two real responsibilities:
- Routing the toolbar icon click to `chrome.tabs.create()` for the GE tracker
  page (§4.7).
- Owning every Google Calendar call (§4.8), because `chrome.identity` isn't
  available to content scripts. Its `onMessage` listener handles only
  `slugpath:calendar-*` messages (returning `false` for anything else so other
  listeners aren't blocked) and `return true`s to keep the channel open for
  the async reply — without that, Chrome closes the port the moment the
  listener returns and `sendResponse` becomes a silent no-op.

### 4.11 Accessibility conventions

Nothing elaborate, but two rules hold across every surface:

- **Native controls only.** Every injected affordance is a real `<button>`,
  `<select>` or `<input>`, never a click-handled `<div>` — so keyboard
  focus/activation and screen-reader roles come for free and there's no
  bespoke keyboard handling to maintain. The one piece of real keyboard logic
  is Escape-closes on the prereq popover (`prereqPopoverInjection.tsx`),
  which also returns focus to the toggle button, because the popover takes no
  focus itself.
- **Injected controls carry an `aria-label` naming the row they act on.**
  Every result row has an identically-labelled "Add to plan"/"Prereqs" button
  and a strip of two-letter GE codes; the visible text can't disambiguate
  them, so the label does (`Add CSE 101 01 to your SlugPath plan`). Same for
  the weekly grid's blocks, which have no room to show the day and time they
  represent.

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
  publish automation yet, just the artifact. The build step passes
  `SLUGPATH_OAUTH_CLIENT_ID` (a repo secret) through to the manifest (§4.8);
  without it the zip still builds, with calendar export non-functional.

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
- **React rendering** is tested sparingly, with `react-dom/server`'s
  `renderToStaticMarkup` (`WeeklyGrid.test.tsx`), so no testing-library
  dependency.
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
| `chrome.storage.local` for everything (plans, taken courses, settings) | Content scripts run on two page origins plus the extension origin; IndexedDB is per-origin there, `chrome.storage.local` is shared and pushes `onChanged` to every context | Dexie/IndexedDB (split into one DB per origin), or Dexie in the service worker behind message-passing |
| Zustand wrapper around settings, not raw `chrome.storage` calls everywhere | React components need to re-render on a setting changed in another context | Manual `useEffect`/polling per consumer |
| Sequential (not `Promise.all`) writes for atomic/linked sections | `addSectionToPlan` is read-modify-write against the `plans` collection; concurrent writes race and drop data | Parallel writes |
| Simple linear-math weekly grid, not a scheduling-UI library | Fixed, small geometry (7am–10pm, 5 columns) — a library would solve a more general problem than exists here | React Big Calendar / similar |
| `DecompressionStream('gzip')` native API | Chrome-only extension; native API has existed since Chrome M80 | A userland gzip JS library |
| Fixed-delay retry in the catalog scraper, not exponential backoff | Manual, infrequent, single-operator script — simplicity over robustness it doesn't need | Exponential backoff + jitter |
| One `content_scripts` manifest entry with `all_frames: true`, host/frame branching in code | `@crxjs/vite-plugin`'s per-filename `web_accessible_resources` tracking breaks with two entries on the same file | Two manifest entries, one per host |
| One pure `geProgress.ts` computing GE progress, shared by 3 UI surfaces (row badges, persistent widget, tracker page) | All three must agree on "is this GE satisfied" — computing it once and feeding all three removes any chance of surfaces silently disagreeing | A separate progress computation per surface |
| GE tracker page opened via toolbar `action` + `chrome.tabs.create`, not `action.default_popup` | The tracker needs real page real estate (a full progress list plus a multi-row assignment picker) a small popup dropdown can't comfortably hold | `default_popup` |
| Hand-written `.ics` writer, not the `ics` npm package the spec named | The needed subset (header, VEVENT, RRULE, escaping, folding) is ~40 lines; no dependency is smaller than that | `ics` |
| `RRULE ... COUNT=n`, not `UNTIL=` | `UNTIL` must be a UTC instant for a zoned `DTSTART`, which drags DST math in; every occurrence is already enumerated, so the exact count is free | `UNTIL` bounded by term end |
| Zoned wall-clock times (`TZID` + `VTIMEZONE`), not floating and not UTC | Keeps a 10am class at 10am across the mid-quarter DST change, and doesn't shift for someone importing from another timezone | Floating local time (tried, rejected on a round-trip test); UTC instants |
| Term date range entered by the user, not a bundled academic calendar | UCSC's real quarter dates aren't in the catalog snapshot; a guessed range silently recurs for the wrong number of weeks | Bundling guessed per-term dates |
| All Google Calendar work in the service worker, reached by one message contract | `chrome.identity` isn't exposed to content scripts, and the export UI is a content script | Direct `chrome.identity` calls per context |
| Per-event failures collected + retried by index, not all-or-nothing | No transactional batch endpoint exists, and re-POSTing a succeeded event duplicates it (no upsert) | Abort on first failure; retry whole plan |
| "Layout changed" banner driven by *rows present but none parsed* | The adapter degrades silently by design, so this is the only false-positive-free signal | Bannering on the `waitForResults` timeout (fires on every non-search page) |

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

Scope source of truth: `V1_FEATURES_AND_TECH.md` §2 ("v1 scope (settled)"). `SlugPath.md`
is reconciled to that section.

Divergences between §2 and the code that are still true:

- **Google controls are not gated yet.** `options/Options.tsx` always renders
  `GoogleCalendarSection`, and `schedule/ExportControls.tsx` always renders
  "Add to Google Calendar". The placeholder client id is refused only at call
  time in `export/googleCalendar.ts`. §2 requires these hidden (plan T2.1).
- **No icons.** `manifest.config.ts` declares no `icons` or `default_icon`, and
  `apps/extension/public/` does not exist (plan T3.1).
- **Deferred in §2 and unwired:** `getCurrentTerm` (`adapters/myucsc.ts`) has no
  production caller, and nothing assigns `linkedSectionKeys` outside tests (§10).
- **Per-major DC data is empty:** `DC_COURSES_BY_MAJOR` in
  `packages/catalog-snapshot/src/geRequirements.ts` is `{}`. §2 defers it.
- **Misleading path name:** the popover lives in `apps/extension/src/prereq-graph/`
  (`PrereqPopover.tsx`), although no graph exists.

Everything else in §2 matches the code: `chrome.storage.local` storage with no
Dexie or IndexedDB, a bundled catalog snapshot with no network fetch (the bundled file is read via `chrome.runtime.getURL`), Google
auth via `chrome.identity.launchWebAuthFlow`, `.ics` download as the export
path, no PNG export, no content script on `catalog.ucsc.edu`, and no telemetry.

## 10. Open/known issues as of this writing

- **`linkedSectionKeys` has no production source** (§4.2) — cross-listed/
  lecture+lab grouping degrades to "treat every section independently"
  until a real DOM signal for it is found and wired into
  `parseSearchResults`.
- **`getCurrentTerm` is unverified against the live site** — don't trust it
  without re-checking against a real captured page first.
- **MyUCSC row GE badges (`geBadgeInjection.ts`, §4.7) have only JSDOM-level
  verification** — unlike the Degree Progress Report importer and the
  `Panel` widget, which were confirmed against the live site, there's no
  UCSC login available in an automated session to check this one live.
- **The OAuth client id exists but lives only in the build environment**
  (§4.8). A build without `SLUGPATH_OAUTH_CLIENT_ID` set (including a plain
  `pnpm build`) still ships the `REPLACE_ME` placeholder. Release builds need
  it set as a repo secret, and the unpacked extension's ID must keep matching
  the one registered with Google.
- **The Google Calendar *success* path has never run end to end.** No
  successful event creation has been observed yet; the error paths show in
  the panel and options page instead of hanging. The `.ics` output *was* validated independently, by round-tripping
  real generated output through `node-ical` (escaping, 75-octet folding,
  recurrence count, and the DST-crossing wall clock all confirmed).
- **`ExportControls` (§4.8) renders on the live site, but no export from it
  has been confirmed working there.** Its inputs (`planToEvents`,
  `eventsToIcs`) are unit-tested and externally validated.
- **The extension has no icons** — `manifest.config.ts` declares no `icons`
  and no `action.default_icon`, which the Chrome Web Store requires before
  submission.

*(Resolved since the last pass: `Panel` and `SchedulePanel` used to both
mount at the same fixed screen corner on `my.ucsc.edu` and silently stack —
fixed by moving `Panel` to `bottom-right`, see §4.7.)*

## 11. Quick command reference

```
pnpm dev             # vite dev server for the extension (apps/extension)
pnpm build           # production build -> apps/extension/dist
SLUGPATH_OAUTH_CLIENT_ID=<id>.apps.googleusercontent.com pnpm build   # same, with Google Calendar export enabled
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
