# SlugPath Product Spec (Draft)

## Product goal
Help UCSC undergraduates plan quarterly schedules and multi-year degree paths by augmenting MyUCSC and the UCSC catalog with:
- an in-page schedule builder with conflict detection,
- a navigable prerequisite graph on every course page, and
- a GE requirement tracker that flags coverage and double-dipping.

## Primary user
UCSC undergraduate students planning schedules and degree progress.

## Core user promises
- **Live schedule builder**: Build a weekly schedule from MyUCSC's class search without leaving the page; conflicts surface as sections are added.
- **Visual prerequisites**: See what a course requires and unlocks as a clickable graph on the course page.
- **GE coverage at a glance**: See which GEs each course satisfies inline, with running progress against the declared major.

## Personas and access model

### Identity
- **No accounts, no server.** All state is per-browser-profile and persists in local storage.
- **Google Calendar linkage**: opt-in per user; OAuth token acquired via `chrome.identity`; only used to write exported schedules.

### Scope
- Extension is scoped to `*.ucsc.edu` (MyUCSC pages, catalog pages) plus internal extension pages (options, GE tracker tab).
- No cross-user data. No off-device telemetry.

## Key product experiences

### 1) Schedule builder overlay
A side panel injected into MyUCSC class search that answers: "What does my week look like if I add this section?"

#### Sections
- **Picked-sections list**: user's chosen sections for the current planning term, grouped by course.
- **Weekly calendar**: Mon–Fri time grid (7am–10pm default), each section rendered as a block. Conflicts flagged in red with a hover tooltip identifying the clashing sections.
- **Actions**:
  - Add from MyUCSC search results (button injected next to each result row).
  - Remove, swap section, mark tentative.
  - Export to Google Calendar (creates a recurring event series per meeting pattern, bounded by the term).
  - Save multiple named plans (e.g. "Winter 2027 — plan A" vs "plan B"); switch between them.

### 2) Prerequisite chain visualizer
A collapsible graph injected onto every catalog course page that answers: "What led up to this course, and what does it open up?"

#### Behavior
- Nodes are courses; edges are prerequisite relations; AND/OR gates render for compound prereqs.
- Two direction toggles: **Requires** (upstream) and **Unlocks** (downstream). Default: 2 levels each way.
- Each node shows course code, title, GE badges, and terms typically offered (if known).
- Click a node → navigate to that course's catalog page (which the extension re-decorates on load).
- Highlight courses already added to any saved plan; distinguish "planned" vs "taken" (courses the user has marked complete in the GE tracker).

### 3) GE requirement tracker
Two surfaces answer: "Which GEs am I missing, and does this course help?"

#### Inline overlay
- On every catalog course page and MyUCSC search result, show a compact list of GE codes the course satisfies.
- If adding a course would double-dip against a GE already covered by a planned or completed course, badge it as "already covered" so users can spot redundancy or intentional double-dips.

#### Checklist tab
- Extension page listing every GE code required for the student's declared major.
- Each requirement shows satisfied / planned / open, with the specific course(s) filling it.
- Detects double-dips explicitly and lets the user pick which GE a given course counts toward when a course satisfies multiple.

## Data sources

### V1
- **UCSC General Catalog** (`catalog.ucsc.edu`): course descriptions, prerequisites, GE designations. Bundled snapshot updated on extension release; fresh fetch on cache miss.
- **MyUCSC class search DOM**: current-term section listings — meeting times, room, instructor, seats. Read via content script; not persisted beyond the user's plans.
- **User input**: declared major, catalog year, courses already taken, named plans.

### VNext
- Live catalog scraping with change detection.
- Slug Survey / RateMyProfessor (opt-in, external).
- Cross-device sync (would require a backend; explicitly out of v1).

## Data freshness and refresh behavior
- **Catalog snapshot**: bundled with the extension; refreshed each release.
- **On-demand fetch**: if the user visits a course page not in the snapshot, the extension fetches and caches it in IndexedDB for the session.
- **MyUCSC section data**: read live from the DOM every time the panel opens; not cached, since seat counts and section availability change constantly.
- **Manual refresh button** in the schedule panel forces a re-parse of the current MyUCSC page.

## Feature specifics

### Schedule builder
- Section representation: `{ courseCode, sectionNumber, meetingPattern[], instructor, seatsOpen }` where a meeting pattern is `{ days, startMinute, endMinute, location }`.
- Conflict detection: two sections conflict if they share any day and their time ranges overlap by ≥ 1 minute. Cross-listed courses and lecture+lab pairs are treated as a single unit.
- Export to Google Calendar: one event per meeting pattern; `RRULE:FREQ=WEEKLY` bounded by the term's academic calendar dates (bundled with the extension).

### Prerequisite graph
- Parser converts catalog prerequisite prose (e.g. "MATH 19A; or MATH 20A; and CSE 30 or equivalent") into a structured tree of AND/OR nodes over course codes.
- Graph engine renders course nodes and AND/OR gates; only course nodes are navigable.
- Prereq strings that fail to parse fall back to a labeled "raw text" node rather than silently dropping the requirement.

### GE tracker
- GE requirement schema per major: which GE codes are required, how many of each, allowed substitutions, double-dip rules.
- Course-to-GE mapping: parsed from the catalog snapshot.
- Progress computation: for each requirement, resolve completed and planned courses; report satisfied / partial / open. Double-dip resolution defers to the user's chosen assignment.

## Storage (client-side only)

### What is stored
- User settings: declared major, catalog year, Google Calendar linkage status, taken-courses list.
- Named schedule plans: courses + chosen sections per plan.
- Cached catalog fetches (from on-demand lookups for courses not in the bundled snapshot).

### Storage medium
- **IndexedDB via Dexie** for plans, taken courses, and catalog cache (larger, structured).
- **`chrome.storage.local`** for user settings (small, cross-context, syncs naturally across popup/content-script/options).
- **Session storage** for transient parse results tied to the currently open MyUCSC page.

### Retention
- Kept until the user deletes them, uninstalls the extension, or clears browser data. No expiry.

## Privacy and compliance
- No accounts. No off-device telemetry by default. No backend.
- Google Calendar access is opt-in and revocable from the extension options page or from the user's Google account settings.
- MyUCSC content is read from the user's own already-authenticated session; the extension does not proxy or exfiltrate any MyUCSC data.
- Content script runs only on `*.ucsc.edu`.

## V1 permissions (Chrome)
- `storage` — user settings.
- `identity` — Google OAuth for calendar export (opt-in flow).
- Host permissions: `*.ucsc.edu/*`, `www.googleapis.com/calendar/*`.
- No `tabs` permission; no `activeTab` beyond what content scripts already provide.

## Exports
- **Google Calendar**: batch-create events for all sections in the selected plan.
- **iCal (`.ics`) download**: same event data, downloadable file for users who don't want to link a Google account.
- **PNG of weekly grid**: from the schedule builder, for sharing.

## MVP acceptance criteria
- User can build a weekly schedule from MyUCSC search, see conflicts, and export to Google Calendar.
- Every catalog course page shows a prerequisite graph with correct upstream/downstream navigation.
- After picking a major, the GE tracker shows correct progress and flags double-dips.
- All state persists across browser sessions and profile restarts.

## V1 success criteria
- **Primary KPI**: median time from "class search opened" to "schedule exported."
- Secondary KPIs:
  - percentage of users who complete a schedule export in their first session,
  - percentage of course pages that render a fully-parsed prereq graph (parser coverage),
  - percentage of GE requirements that resolve without manual double-dip intervention.

## Next spec expansion
- Full parser grammar for catalog prerequisite prose.
- Failure-mode catalog for MyUCSC DOM changes (selector-layer design).
- Detailed graph and calendar rendering specifications.
- V2 roadmap (four-year planner, professor ratings, grade distributions, cross-device sync).
