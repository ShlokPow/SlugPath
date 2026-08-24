# Handoff — mid Phase 5

Status snapshot as of `main` @ `dbd63d0` (2026-08-19; PR #3 merged
`feature/myucsc-prereq-popover`, and `iteration` is fast-forwarded to match).
**Not yet merged:** branch `feature/ge-tracker` (11 commits ahead of `main`,
tip `542df3a`) has the 2026-08-19 to 2026-08-22 Phase 5 kickoff work
described below. This doc exists so a fresh session can pick up Phase 5 (or
finish merging this branch) without re-deriving the last few sessions'
context.

## Session update (2026-08-19 to 2026-08-22) — Phase 5: GE tracker kickoff

Branch: `feature/ge-tracker` (off `main` @ `dbd63d0`, unmerged, tip `542df3a`).
First real Phase 5 work — dataset, tracker UI, MyUCSC badges, and a
Degree-Progress-Report import feature added mid-session from live user
feedback that wasn't in the original Phase 5 checklist.

1. **Shared foundation landed first** (`370955e`), mirroring how Phase 4 split
   MyUCSC adapter vs. schedule domain+UI against a small shared contract:
   - `packages/catalog-snapshot/src/geRequirements.ts`: `GE_REQUIREMENTS`, 15
     codes (CC, ER, IM, MF, SI, SR, TA, C, DC, plus the PE-E/PE-H/PE-T and
     PR-E/PR-C/PR-S choice groups) sourced from catalog.ucsc.edu's real GE
     requirements page. **DC (Disciplinary Communication) is genuinely
     per-major** — satisfied by 1-3 major-defined upper-division courses, not
     a general catalog GE tag — so `DC_COURSES_BY_MAJOR` is left empty with a
     `ponytail:` marker rather than guessed.
   - `apps/extension/src/ge-tracker/geProgress.ts`: pure, tested logic
     (`computeGEProgress`, `computeGESlots`, `findMultiGECourses`, later
     `applyGEAssignment`) that every UI surface below reads from — no
     DOM/storage access, same pure/impure split as the old `graphModel.ts`.
2. **Two parallel worktree-agents built on that foundation** and merged
   cleanly (`6561939`, `48c5ee2`): one did the options-page catalog-year
   picker (`Options.tsx`) + inline GE badges on MyUCSC search rows
   (`content/geBadgeInjection.ts`, dim vs. filled chip per code depending on
   whether `computeGEProgress` already reports it satisfied); the other did
   the standalone GE tracker page (`ge-tracker/GETrackerPage.tsx` + a new
   toolbar `action` opening it via `chrome.tabs.create`) with a progress
   summary and a multi-GE "pick a primary GE" assignment picker (additive
   `Settings.geAssignments`, per `docs/migrations.md`'s convention).
   - **Gotcha**: `@crxjs/vite-plugin` only auto-discovers HTML referenced by
     specific manifest keys (`options_page`, `action.default_popup`,
     `devtools_page`, etc.) — a page only ever opened via
     `chrome.tabs.create` (like the GE tracker tab) isn't one of those, so
     the build silently produced no `dist/src/ge-tracker/index.html` at all
     until an explicit `build.rollupOptions.input` entry was added to
     `vite.config.ts`. Verified empirically (checked `dist/` before/after)
     rather than trusted on faith — worth checking again for any future page
     opened the same way.
3. **Test hardening** (`93c296b`): `GETrackerPage.tsx`'s inline
   add-or-delete-a-key assignment logic was untested — extracted to
   `applyGEAssignment()` in `geProgress.ts` and unit-tested directly. Also
   added a test locking in a behavior that was previously only documented by
   a code comment: `findMultiGECourses` is computed from progress *without*
   assignments applied, so a course stays in the "double-counted" picker
   list after being assigned — otherwise the picker that set the assignment
   would disappear once used. 118 tests at this point.
4. **Live-verified against the real built extension** (Playwright,
   `launchPersistentContext` + `--load-extension`, same approach as prior
   sessions) since this touches DOM injection and a brand-new extension
   page: real courses from the bundled catalog (`CRES 143` = CC+ER, `AM 3` =
   MF) seeded directly into the extension's own IndexedDB, then confirmed
   the options page persists settings across reload, the tracker page loads
   real catalog data and shows the right satisfied/open counts, and the
   assignment picker correctly re-computes slot satisfaction. 18 checks, all
   passed; screenshots confirmed the rendering visually too. MyUCSC row
   badges only got JSDOM-level verification (real captured-row fixture) —
   no UCSC login available to check live.
5. **User-driven addition: import GE completions from MyUCSC's Degree
   Progress Report** (`b99be9c`, `d89e1e6`) — not in the original Phase 5
   checklist, added after the user asked whether taken-course data could be
   pulled automatically instead of entered by hand (there's still no
   "mark course taken" UI at all — `Panel.tsx` was a stub until this
   session, see below). Built from real markup the user captured via
   DevTools over several back-and-forth rounds (My Academics → Degree
   Progress Report, GENERAL EDUCATION REQUIREMENTS section):
   - `adapters/degreeProgress.ts`: `parseDegreeProgressGE()`. Each of the 11
     non-DC categories renders as `td.PSGROUPBOXLABEL` reading "GE
     `<CODE>`: `<Name>`"; satisfied is signaled by a sibling
     `<img alt="requirement satisfied">` — the *only* confirmed signal, since
     no unsatisfied example has been captured yet (this user had satisfied
     all 10 of their non-DC categories). **DC is structurally different and
     deliberately excluded**: it renders as a plain `td.PAGROUPDIVIDER`
     divider with no satisfied icon at all, because its own text says DC is
     satisfied per-major "in the Upper-Division Requirements section for
     each major below" — a different part of the page this adapter doesn't
     touch, consistent with `DC_COURSES_BY_MAJOR` staying unsourced.
   - **Course-level detail only exists in the DOM once a category's row has
     been expanded** — PeopleSoft loads it via a real `submitAction_win0`
     server round-trip, not a CSS toggle. Rather than automate 11 sequential
     expand-and-wait postbacks, the importer just reads whatever's currently
     in the DOM: an expanded category yields real course credit (written to
     `db.takenCourses`, only for a course whose status icon reads exactly
     "Taken" — no other status has been captured, and there's nowhere in
     this extension's model to put a "planned per DPR" course anyway, since
     "planned" means "in a Plan's sections" which needs a specific MyUCSC
     section DPR doesn't expose); a still-collapsed category just marks its
     GE code satisfied with no specific course attached.
   - `computeGESlots` grew an optional `confirmedSlotIds` param for that
     "satisfied, no course" case (new additive `Settings.degreeProgressGECodes`
     / `degreeProgressImportedAt`) — `GETrackerPage.tsx` shows "Confirmed by
     Degree Progress Report" for a slot satisfied that way.
   - `content/degreeProgressImport.ts` injects the "Import GE completions"
     button. **No manifest change was needed** — the page's real URL
     (`my.ucsc.edu/psc/csprd/EMPLOYEE/SA/c/...`) confirmed it renders under
     `my.ucsc.edu` itself, already in `content_scripts[0].matches`, unlike
     class search which turned out to live on `pisa.ucsc.edu`.
   - Tests use the user's real captured HTML as verbatim fixtures, same
     convention as `myucsc.test.ts` — and this caught a real bug: the status
     icon's id is `win0divCRSE_STAT$N`, not `CRSE_STAT$N` like the sibling
     fields, so the first selector attempt silently always returned
     'planned'.
6. **Two UI tweaks from live user testing, not in the original plan**
   (`e95f71f`, `542df3a`):
   - `content/Panel.tsx` was an inert "Hello SlugPath" placeholder;
     repurposed into an always-visible GE summary widget (reuses the exact
     same `computeGESlots` call as the tracker page) so a student sees
     satisfied/open GEs directly on MyUCSC without opening the toolbar
     popup. **Had to move it from top-right to bottom-right**: `SchedulePanel`
     is also `position: fixed` at `top:16/right:16` on `my.ucsc.edu`, so the
     two were stacking on the same spot — `SchedulePanel` (320×480, mounted
     later in the DOM) was almost certainly covering the small placeholder
     entirely, which is why the user reported never seeing anything there.
     Worth remembering for any future fixed-position content-script UI: check
     what else already claims that corner on the same host.
   - `schedule/SchedulePanel.tsx` made collapsible: a clickable navy header
     bar (active plan's name + a ▾/▸ arrow) toggles the rest of the
     320×480 box, collapsing down to just the header row on click — same
     pattern `Panel.tsx` already used.

131 tests pass, typecheck/build/lint clean on the branch tip. **Not merged to
`main`/`iteration` yet** — next session should decide whether to open a PR /
merge (same as the `feature/myucsc-prereq-popover` workflow two sessions
back), then resume the usual `main`→`iteration` fast-forward sync.

### Gotchas hit this session (don't rediscover these)

- **The Degree Progress Report is genuine classic PeopleSoft** (`win0div*`,
  `ACE_*`, `submitAction_win0(...)` postback links) — unlike MyUCSC class
  search, which turned out to be a custom Bootstrap page on `pisa.ucsc.edu`
  (see the 2026-08-18 session below). Don't assume every MyUCSC page follows
  the same rendering approach; check the real URL and markup per page.
- **A PeopleSoft collapsible section's body content doesn't exist in the DOM
  until it's actually been expanded** (a real server round-trip, not a CSS
  `display:none` toggle) — a scraper reading a collapsed row will correctly
  find the satisfied-icon summary but zero course-level detail. Confirmed by
  capturing the same GE category both collapsed and expanded.
- **`@crxjs/vite-plugin` doesn't auto-discover every manifest-referenced HTML
  page** — only specific keys (`options_page`, `action.default_popup`,
  `devtools_page`, `sandbox.pages`, `side_panel.default_path`,
  `chrome_url_overrides`). A page meant to be opened via `chrome.tabs.create`
  needs an explicit `build.rollupOptions.input` entry in `vite.config.ts` or
  the build silently drops it with no error — verify by checking `dist/`
  actually contains the expected HTML file after a build, don't just trust
  the manifest entry.
- **Two `position: fixed` content-script elements at the same viewport
  corner silently stack on top of each other** — the later-mounted one wins
  visually, and the covered one can look "broken" (nothing happens on
  click, nothing visible) when it's actually rendering fine, just hidden.
  Check what other panels already claim a corner before adding a new
  fixed-position widget to the same host.
- Real UCSC GE codes (verified against the live catalog and a real Degree
  Progress Report, 2026-08-19): **CC, ER, IM, MF, SI, SR, TA, C, DC**, plus
  the 3-way choice groups **PE-E/PE-H/PE-T** (Perspectives) and
  **PR-E/PR-C/PR-S** (Practice) — 15 leaf codes, 11 requirement slots once
  the two choice groups collapse to one slot each.

## Session update (2026-08-18) — MyUCSC prereq popover; catalog graph removed

Branch: `feature/myucsc-prereq-popover` (off `main` @ `f59e59b`, unmerged).
User-driven scope change, not a planned phase: replaced the catalog-page
prereq graph with a lighter per-row popover on MyUCSC class search, then
deleted the graph feature outright once the popover was confirmed working.

1. **Added a direct-prereqs popover to MyUCSC class-search rows** (`13e193f`).
   A "Prereqs" button next to each result row's existing "Add to plan"
   button (same injection pattern, see `content/scheduleInjection.ts`) opens
   a small text popover showing *only* that course's own prerequisites —
   AND/OR-joined chips, taken/planned colored, no recursion into deeper
   courses, no graph layout. New files: `prereq-graph/PrereqPopover.tsx`
   (render), `prereq-graph/prereqText.ts` (pure AST→display-segment
   transform, unit-tested — same pure/impure split as the old
   `graphModel.ts`/`PrereqGraphPanel.tsx`), `content/prereqPopoverInjection.tsx`
   (row injection), `content/shadowMount.ts` (the shadow-DOM host helper,
   factored out of `content/index.tsx` since it was needed in a 4th place).

2. **Found and fixed a pre-existing, unrelated bug this surfaced** (`f9e6194`):
   `adapters/myucsc.ts` was *never actually verified against the real site*.
   Its own old header comment said so ("SYNTHETIC fixture — NOT a verbatim
   capture"), and it turned out to be flatly wrong: MyUCSC's class-search
   results aren't rendered by PeopleSoft at all. The "Main Content" iframe
   navigates to a separate UCSC-built page at **`pisa.ucsc.edu`**, using
   Bootstrap `panel`/`row` divs (`id="rowpanel_N"`, `id="class_nbr_N"`)
   instead of the assumed PeopleSoft-classic `<tr>`/`RECORDNAME_FIELDNAME$n`
   markup. Result: **neither** "Add to plan" nor the new "Prereqs" button
   ever appeared on the real site — this had apparently never worked in
   production. Fixed by:
   - `manifest.config.ts`: adding `https://pisa.ucsc.edu/*` to
     `content_scripts[0].matches` — without it, the frame with the actual
     results never even got the content script.
   - `adapters/myucsc.ts`: rewrote `parseSearchResults`/`waitForResults`'s
     row selectors, field extraction (icon-class-based, e.g. `.fa-clock-o`
     for meeting time), and seat math (`"N of M Enrolled"` → `M - N`, not
     the old `"N / M"` assumption) against a real captured row (verbatim
     HTML pasted by the user via DevTools → Copy outer HTML).
   - `content/index.tsx`: run the row-button injectors inside the
     `pisa.ucsc.edu` frame too, not just `my.ucsc.edu`'s top frame.
   - Rewrote `myucsc.test.ts` and `scheduleInjection.test.ts` fixtures to
     match the real markup; row 0 in `myucsc.test.ts` is a verbatim capture,
     documented as such (same convention as `catalog.test.ts`).
   - **Cross-listed/linked-section detection (`linkedSectionKeys`) has no
     verified real signal** — the old `data-linked-keys`/`CLASS_LINKED`
     mechanism was entirely invented, never matched anything real. Left
     unset with a `ponytail:` comment rather than guessing; `resolveAtomicGroup`
     already degrades gracefully to "just this section" when unset.
   - `getCurrentTerm` is *still* unverified (no production caller uses it) —
     deliberately left alone, flagged with a `ponytail:` comment.

3. **Deleted the catalog-page prereq graph entirely** (`9d25bda`), once the
   popover above was confirmed working — user's call, since the popover
   covers the "do I have what this needs" use case the graph existed for,
   without the graph's node-overlap/edge-routing bugs from the 2026-08-16
   session below. Removed: `PrereqGraphPanel.tsx`, `graphModel.ts` (+ test),
   `adapters/catalog.ts` (+ test, `findCourseBlocks` — catalog.ucsc.edu DOM
   adapter, had no other caller), the `@xyflow/react`/`@dagrejs/dagre` deps
   (shrank the content-script bundle from ~268KB to ~20KB), and
   `catalog.ucsc.edu` from `manifest.config.ts`'s `content_scripts` matches
   (nothing runs there anymore). `normalizeCode` moved from `graphModel.ts`
   into `prereqText.ts`, since `PrereqPopover.tsx` still needs it.

All 97 tests pass (down from 109 pre-deletion), typecheck/build/lint clean
on the branch tip. **Not merged to `main`/`iteration` yet** — next session
should decide whether to open a PR / merge, then resume the usual
`main`→`iteration` fast-forward sync.

### Gotchas hit this session (don't rediscover these)

- **Don't trust an unverified DOM adapter just because it has tests.**
  `myucsc.ts` had a full synthetic test suite and looked done, but its
  fixture was invented, not captured — it was 100% wrong against
  production. The tell was in its own header comment ("SYNTHETIC... NOT a
  verbatim capture"). Anything scraping a real external site should get a
  real verbatim-capture fixture (DevTools → Copy outer HTML) before being
  trusted, same as `catalog.test.ts` already did it right.
- **Literal `\uXXXX` unicode escapes typed into a tool call get silently
  swapped to the actual character**, both via the Edit tool (which warns
  about it: "Edit also tried swapping \uXXXX escapes and their characters")
  and apparently earlier in the pipeline too, since it also happened
  through a Bash/Python heredoc. Burned significant time chasing a
  `headerText.split(/<nbsp>+/)` regex that kept silently reverting.
  Workaround that actually worked: avoid the escape literal entirely —
  `String.fromCharCode(160)` instead of a literal nbsp character in source you're writing
  through any tool.
- **When testing the built extension manually, don't just click "reload"
  in `chrome://extensions` after a rebuild.** Stale chunk-hash references
  (`ERR_FILE_NOT_FOUND`, "failed to fetch dynamically imported module")
  showed up when the loaded extension and the on-disk `dist/` fell out of
  sync (e.g. `npm run dev`'s server not running, or a build ran after
  load). Safest cycle: `rm -rf dist && npm run build`, remove the extension
  from `chrome://extensions` entirely, **Load unpacked** again, then hard
  refresh the target tab.
- `content_scripts[0].matches` for this extension is now
  `['https://my.ucsc.edu/*', 'https://pisa.ucsc.edu/*']` — `catalog.ucsc.edu`
  is gone, `pisa.ucsc.edu` is new. Update this note if either changes again.

## Session update (2026-08-16) — pre-Phase-5 bug fixes

Before starting Phase 5, fixed two rendering bugs in the prereq graph panel
(`apps/extension/src/prereq-graph/`), both committed in `41c9b52`:

- **Course nodes overlapped rows below them.** `graphModel.ts`'s `NODE_SIZE`
  told dagre every course node was 64px tall, but `CourseNode` in
  `PrereqGraphPanel.tsx` renders code + title + optional GE-code badges +
  optional taken/planned label, which runs to ~80-90px whenever those extras
  are present (e.g. CSE 100L's "MF" GE badge). Bumped `NODE_SIZE.course.height`
  to 96 so dagre reserves enough room regardless of content.
- **Edges between distant nodes drew huge swooping loops.** Edges had no
  explicit `type`, so React Flow used the default cubic-bezier edge, which
  draws tangents off each node's Top/Bottom handle — those tangents balloon
  into large loops when two connected nodes sit far apart horizontally but
  close together vertically (normal for a wide dagre `TB` layout with several
  siblings per rank). Set `defaultEdgeOptions={{ type: 'smoothstep' }}` on
  `<ReactFlow>`, which routes with constrained orthogonal segments instead.

**Investigated (not fixed): the "unlocks" tab silently drops relationships
it can't parse.** `courseListsAsPrereqOf` (`graphModel.ts`) only counts course
B as unlocked-by-target A if `parsePrereq(B.prereqRaw)` fully succeeds.
Measured against the real bundled catalog snapshot: 1706 of 3381 courses with
a `prereqRaw` fail to parse, and 182 of those still literally name a known
course code in their raw text (e.g. `ANTH 280` / `ANTH 280L`'s mutual
"concurrent enrollment" requirement, `ART 104`'s "three courses from: ART 15,
ART 20G, …" cardinality list). Those 182 relationships are currently invisible
in the unlocks tab.

Considered and rejected a text-matching fallback (scan unparsed raw text for
a mention of the target course code) because catalog prose isn't reliable
enough for that: `APLX 135`'s raw text says "cannot receive credit for this
course and APLX 235" — an anti-requisite, the *opposite* of a prereq — and a
blind text match would draw a false "unlocks" edge for it. This is exactly
the failure mode `parser.ts`'s `NARRATIVE_BOUNDARY_RE` already guards against
for the "requires" direction; bypassing it in `graphModel.ts` would
reintroduce it for "unlocks".

Left as-is deliberately, not by default: the real fix is extending
`packages/prereq-parser`'s grammar to understand more phrasings (same
pattern as the placement-exam-score fix in `d57b408`) so more prereqs parse
successfully in the first place. That's fully decoupled from
`graphModel.ts` — it calls `parsePrereq` and trusts the result, so a parser
improvement fixes "unlocks" (and "requires") automatically with no graph-layer
changes. Deferring costs nothing but the gap staying live; it's a clean,
separable follow-up whenever someone wants to shrink it.

## What's done (Phases 0–4)

Everything in `V1_FEATURES_AND_TECH.md`'s execution plan through Phase 4 is
implemented, tested, and verified live against real UCSC sites (Playwright,
not just unit tests). Highlights worth knowing before touching adjacent code:

- **Storage** (`apps/extension/src/storage/`): Dexie for `plans` /
  `takenCourses` / `catalogCache`; `chrome.storage.local` for settings via
  `settingsStore.ts`. See `docs/migrations.md` before changing either schema.
- **Prereq parser** (`packages/prereq-parser/`): tokenizer + recursive-descent
  parser, AST is `Course | And | Or | Constraint`. Deliberately: an OR group
  fails *entirely* (falls back to raw text) if any single member can't be
  tokenized — so any new prereq phrasing you notice in the fallback UI is
  worth checking with a grep against the bundled catalog snapshot before
  dismissing it as rare. (Real example: placement-exam-score clauses were
  silently poisoning 32 courses' OR groups, including MATH 21/CSE 30/CHEM 1A,
  until fixed in `d57b408`.)
- **Prereq graph — REMOVED** (merged to `main`/`iteration` 2026-08-19 via
  PR #3, see the 2026-08-18 session update below for why). Was React Flow +
  dagre in `apps/extension/src/prereq-graph/`. Replaced by a
  direct-prereqs-only popover on MyUCSC class search (`PrereqPopover.tsx` +
  `prereqText.ts`) — no tree, no layout engine.
- **MyUCSC adapter** (`apps/extension/src/adapters/myucsc.ts`): the single
  module owning MyUCSC DOM selectors, per the spec's non-negotiable
  selector-abstraction requirement. Exports `parseSearchResults`,
  `getCurrentTerm`, `waitForResults`. Day codes: M/T/W/F single letters, `Th`
  for Thursday. Its selectors are verified against a real captured row (see
  the 2026-08-18 session update below for what changed and why) — this is
  now the version on `main`/`iteration` too, since PR #3 merged.
- **Schedule builder** (`apps/extension/src/schedule/`,
  `content/scheduleInjection.ts`): plan CRUD in `planStore.ts`, conflict
  detection in `conflicts.ts` (exempts linked sections), injection logic
  extracted to `scheduleInjection.ts` for testability. Cross-listed/lab+lecture
  pairs are handled via `Section.linkedSectionKeys` and added as one atomic,
  *sequential* write (`resolveAtomicGroup` + a `for` loop, not
  `Promise.all` — concurrent writes race against the same Dexie
  read-modify-write and silently drop entries).
- **GE tracker — in progress on `feature/ge-tracker`, unmerged** (see the
  2026-08-19 to 2026-08-22 session update above for full detail). Pure logic
  in `apps/extension/src/ge-tracker/geProgress.ts`; GE dataset in
  `packages/catalog-snapshot/src/geRequirements.ts`; surfaces on the options
  page, MyUCSC row badges, the persistent `Panel.tsx` widget, and a
  standalone tracker page/tab; can import real completions from MyUCSC's
  Degree Progress Report (`adapters/degreeProgress.ts` +
  `content/degreeProgressImport.ts`).

## Known gotchas (don't rediscover these)

- **`manifest.config.ts` content_scripts must stay a single entry.**
  `@crxjs/vite-plugin` tracks `web_accessible_resources` matches keyed by
  content-script *source filename*. Two `content_scripts` entries both
  pointing at `src/content/index.tsx` (one per hostname) silently overwrite
  each other's web-accessible-resources grant, breaking the entire content
  script on whichever host loses. Keep one entry covering all matched hosts
  with `all_frames: true`, and gate any top-frame-only UI (the main Panel,
  SchedulePanel) behind `window.top === window` in `content/index.tsx`
  instead of splitting the manifest entry.
- **`gh` CLI**: installed via `winget install --id GitHub.cli`, authenticated,
  but not on PATH in the Bash tool's shell. Invoke via full path:
  `"/c/Program Files/GitHub CLI/gh.exe"` (no `/bin/` subfolder).
- **Two-branch workflow**: work happens on `main`, then `iteration` is kept
  in sync via `git checkout iteration && git merge main --ff-only && git push`.
  Keep doing this each session so both branches stay fast-forwardable.
- Bash tool's working directory persists across calls in a session — a
  leftover `cd packages/prereq-parser` will silently break a later
  repo-root `pnpm vitest run` (wrong root/include globs). `cd` back
  explicitly before running workspace-root commands.

## Verification approach that's worked

No project skill exists yet for launching this extension. Ad hoc Playwright
scripts (`launchPersistentContext` with `--load-extension` /
`--disable-extensions-except`, pointed at the built `apps/extension/dist`)
against the *real* catalog.ucsc.edu and my.ucsc.edu have caught two bugs unit
tests missed (the manifest web_accessible_resources issue, and confirming the
placement-score parser fix visually). Worth doing this again for Phase 5/6 UI
work rather than trusting unit tests alone for anything DOM-injection-related.
Consider running `/run-skill-generator` next time to capture this as a real
project skill instead of rewriting throwaway driver scripts each time.

## Next up — Phase 5: GE tracker

Per `V1_FEATURES_AND_TECH.md` (search "Phase 5"). In progress on
`feature/ge-tracker` (unmerged — see the 2026-08-19 to 2026-08-22 session
update above for what shipped and why):

- [x] Per-major GE requirements dataset in `packages/catalog-snapshot`
      (`geRequirements.ts`) — DC's per-major course list is the one piece
      still unsourced, deliberately.
- [x] Options page: major + catalog year picker, writes to settings.
- [x] Inline GE badges on MyUCSC search rows (`geBadgeInjection.ts`).
- [ ] Inline GE badges on catalog pages — **deferred**, not just unfinished:
      the `catalog.ucsc.edu` adapter was deleted in the 2026-08-18 session
      (see below), so this needs a new adapter built and verified against a
      real capture from scratch, same as `catalog.ts` originally was.
- [x] Double-dip detection against the user's plan/taken set
      (`computeGEProgress`/`computeGESlots` in `geProgress.ts`), now also
      fed by an optional MyUCSC Degree Progress Report import.
- [x] Standalone GE tracker extension page (`GETrackerPage.tsx`, opened via
      a new toolbar `action`).
- [x] Multi-GE assignment UI + progress summary (`GETrackerPage.tsx`,
      `applyGEAssignment`).

Next steps for a fresh session:
- **Decide whether to open a PR / merge `feature/ge-tracker`** (same
  decision point `feature/myucsc-prereq-popover` was at two sessions ago),
  then resume the `main`→`iteration` fast-forward sync.
- If continuing Phase 5 work instead: the catalog-page GE badge item above is
  the main gap left against the original checklist. DC's per-major course
  data (`DC_COURSES_BY_MAJOR`) is the other — would need each major's real
  advising-sheet content, not guessed.
- The Degree Progress Report import, the `Panel.tsx` GE widget, and the
  collapsible `SchedulePanel.tsx` were all confirmed working live by the
  user this session. **MyUCSC row badges (`geBadgeInjection.ts`) were not**
  — only JSDOM-level verification exists (Claude has no UCSC login to check
  live, and the user was never explicitly asked to confirm this one). Worth
  a real-site check next session.

## Remaining phases after this

Phase 5 (GE tracker) → Phase 6 (Google Calendar / iCal export) → Phase 7
(polish/hardening) → Phase 8 (release). Full detail for each lives in
`V1_FEATURES_AND_TECH.md`.
