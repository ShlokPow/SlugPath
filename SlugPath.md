# SlugPath Product Spec (Draft)

Scope source of truth: `V1_FEATURES_AND_TECH.md` §2 and §9. Where this document and that file disagree, that file wins.

## Product goal
Help UCSC undergraduates plan quarterly schedules by augmenting MyUCSC class search with:
- an in-page schedule builder with conflict detection,
- a prerequisite popover on each class-search result row, and
- a GE requirement tracker that flags coverage and double-dipping.

## Primary user
UCSC undergraduate students planning schedules and degree progress.

## Core user promises
- **Live schedule builder**: Build a weekly schedule from MyUCSC's class search without leaving the page; conflicts surface as sections are added.
- **Prerequisites at a glance**: Open a row's prerequisites to see its direct requirements as AND/OR chips, with courses already taken or planned marked. Unparseable requirements show as raw text.
- **GE coverage at a glance**: See which GEs each class-search result satisfies inline, and track GE progress in a tracker tab.

## Personas and access model

### Identity
- **No accounts, no server.** All state is per-browser-profile. Plans, taken courses and settings persist in `chrome.storage.local`; the Google token (if linked) is held in `chrome.storage.session`.
- **Google Calendar linkage**: opt-in per user; OAuth token acquired via `chrome.identity.launchWebAuthFlow`; only used to write exported schedules.

### Scope
- Content scripts run only on `https://my.ucsc.edu/*` and `https://pisa.ucsc.edu/*` (MyUCSC class search and its results frame). Nothing runs on `catalog.ucsc.edu`.
- Extension pages: options page and the GE tracker tab.
- No cross-user data. No telemetry.

## Key product experiences

### 1) Schedule builder overlay
A side panel injected into MyUCSC class search that answers: "What does my week look like if I add this section?"

#### Sections
- **Picked-sections list**: user's chosen sections for the current plan, grouped by course. Sections in conflict are highlighted.
- **Weekly calendar**: Mon–Fri time grid (7am–10pm), each section rendered as a block. Conflicting sections are flagged.
- **Actions**:
  - Add from MyUCSC search results (button injected next to each result row).
  - Remove a section from a plan.
  - Export as `.ics` (primary). Export to Google Calendar only if Decision D2 clears (see Exports).
  - Save multiple named plans (e.g. "Winter 2027 — plan A" vs "plan B"); create, rename, duplicate, delete, and switch between them.

### 2) Prerequisite popover
A per-row popover on MyUCSC class search, opened from a control next to each result's "Add to plan" button. It answers: "What does this course require?"

#### Behavior
- Shows the course's direct prerequisites as AND/OR chips.
- Courses the user has marked taken, and courses in a plan, are coloured differently.
- If a prerequisite string does not parse, the popover shows the raw text instead of dropping the requirement.
- Parser coverage is partial; the coverage figure is tracked by the `coverage:prereq` report (plan T1.5), not by this spec.

### 3) GE requirement tracker
Two surfaces answer: "Which GEs am I missing, and does this course help?"

#### Inline overlay
- On every MyUCSC search result, show a compact list of GE codes the course satisfies.
- If a course would double-dip against a GE already covered by a planned or taken course, badge it as "already covered" so users can spot redundancy or intentional double-dips.

#### Tracker tab
- Extension page listing the campus-wide GE requirements, with progress from taken and planned courses and any imported Degree Progress Report completions.
- Each requirement shows its satisfying course(s).
- Detects double-dips explicitly and lets the user pick which GE a given course counts toward when a course satisfies multiple.
- DC course lists are per-major and are not in v1.

## Data sources

### V1
- **UCSC General Catalog snapshot**: bundled with the extension (`packages/catalog-snapshot`). Course code, title, units, prerequisite text and GE codes. No network fetch at runtime.
- **MyUCSC class search DOM**: current-term section listings: meeting times, room, instructor, seats. Read via content script; not persisted beyond the user's plans.
- **User input**: taken-courses list, named plans, GE assignments, and Degree Progress Report completions imported from MyUCSC.

### VNext
- Live catalog scraping with change detection.
- Slug Survey / RateMyProfessor (opt-in, external).
- Cross-device sync (would require a backend; explicitly out of v1).

## Data freshness and refresh behavior
- **Catalog snapshot**: bundled with the extension; regenerated manually with `build:catalog` before a release. The options page shows the catalog year as text.
- **MyUCSC section data**: read live from the page DOM as results render; not cached, since seat counts and section availability change constantly.

## Feature specifics

### Schedule builder
- Section representation: `{ courseCode, sectionNumber, meetingPattern[], instructor, seatsOpen }` where a meeting pattern is `{ days, startMinute, endMinute, location }`.
- Conflict detection: two sections conflict if they share any day and their time ranges overlap by ≥ 1 minute. Lecture+lab and cross-listed grouping (`linkedSectionKeys`) is deferred until a real DOM signal is captured; until then each section is treated independently.

### Prerequisite popover
- Parser converts catalog prerequisite prose (e.g. "MATH 19A; or MATH 20A; and CSE 30 or equivalent") into a structured tree of AND/OR nodes over course codes.
- Strings the grammar cannot fully understand fall back to raw text rather than being guessed.

### GE tracker
- GE requirements come from the bundled snapshot (`GE_REQUIREMENTS`). Course-to-GE mapping is taken from the catalog snapshot.
- Progress computation: for each requirement, resolve taken and planned courses; report satisfied / partial / open. Double-dip resolution defers to the user's chosen assignment.

## Storage (client-side only)

### What is stored
- User settings: catalog year, Google Calendar linkage status, GE assignments, taken-courses list, imported GE completions.
- Named schedule plans: courses + chosen sections per plan.

### Storage medium
- **`chrome.storage.local`** for settings, taken courses, and plans (small, cross-context, so popup, content script, and options page see the same data).
- **`chrome.storage.session`** for the cached Google access token (cleared when the browser session ends).
- No IndexedDB and no Dexie.

### Retention
- Kept until the user deletes them, uninstalls the extension, or clears browser data. No expiry.

## Privacy and compliance
- No accounts. No telemetry. No backend.
- Google Calendar access is opt-in. Unlink on the options page clears the cached token, and access can be fully revoked from the user's Google account permissions page.
- MyUCSC content is read from the user's own already-authenticated session; the extension does not proxy or exfiltrate any MyUCSC data.
- Content scripts run only on `https://my.ucsc.edu/*` and `https://pisa.ucsc.edu/*`.

## V1 permissions (Chrome)
- `storage`: user settings, taken courses, and plans.
- `identity`: Google OAuth for calendar export (opt-in flow).
- Host permissions: `https://www.googleapis.com/calendar/*` only.
- Content script matches (`my.ucsc.edu`, `pisa.ucsc.edu`) are declared in `content_scripts`, not in host permissions.
- No `tabs` permission; no `activeTab`.

## Exports
- **`.ics` download**: one recurring weekly event per meeting pattern, bounded by a term first and last day the user enters. Primary export path; no account needed.
- **Google Calendar**: batch-create the same events in the user's calendar. Shipped only if Decision D2 clears (live OAuth check passes and the owner accepts the unverified-app limits or completes Google's verification). Otherwise its controls are to be hidden from the build (plan T2.1; not yet gated in code).
- No PNG export in v1.

## MVP acceptance criteria
- User can build a weekly schedule from MyUCSC search, see conflicts, and export a `.ics` file.
- Every MyUCSC search result row offers a prerequisite popover with AND/OR chips, and shows raw text when a prerequisite string does not parse.
- The GE tracker shows progress from taken and planned courses and flags double-dips.
- Plans, taken courses and settings persist across browser restarts.

## V1 success criteria
Targets, measured without telemetry (see `V1_FEATURES_AND_TECH.md` §9):
- Prereq parse rate: `coverage:prereq` on the bundled snapshot, with the stop rule from the plan.
- Adapter correctness. Target: 100% of captured rows parse (verbatim-capture fixture tests).
- Export correctness. Target: `.ics` output round-tripped through an independent parser passes all checks.
- Live smoke: the §9 launch checklist run by the owner on real MyUCSC before each release.

## Next spec expansion
- Full parser grammar for prerequisite prose.
- Failure-mode catalog for MyUCSC DOM changes (selector-layer design).
- Term stamping of plans and lecture+lab linked sections, once real markup is captured.
- V2 roadmap (four-year planner, professor ratings, grade distributions, cross-device sync).
