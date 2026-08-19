# Handoff — start of Phase 5

Status snapshot as of `main` @ `f59e59b` (2026-08-16); `iteration` is
fast-forwarded to match. **Not yet merged:** branch `feature/myucsc-prereq-popover`
(3 commits ahead of `main`) has the 2026-08-18 work described below — the
catalog-page prereq graph is gone on that branch but still present on
`main`/`iteration` until it's merged. This doc exists so a fresh session can
pick up Phase 5 (or finish merging this branch) without re-deriving the last
few sessions' context.

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
- **Prereq graph — REMOVED as of `feature/myucsc-prereq-popover` (2026-08-18,
  see that session update above), still present on `main`/`iteration` until
  merged.** Was React Flow + dagre in `apps/extension/src/prereq-graph/`.
  Replaced by a direct-prereqs-only popover on MyUCSC class search
  (`PrereqPopover.tsx` + `prereqText.ts`) — no tree, no layout engine.
- **MyUCSC adapter** (`apps/extension/src/adapters/myucsc.ts`): the single
  module owning MyUCSC DOM selectors, per the spec's non-negotiable
  selector-abstraction requirement. Exports `parseSearchResults`,
  `getCurrentTerm`, `waitForResults`. Day codes: M/T/W/F single letters, `Th`
  for Thursday. **As of `feature/myucsc-prereq-popover` (2026-08-18), its
  selectors are verified against a real captured row** — the version on
  `main`/`iteration` is still the old, never-actually-verified-against-
  production one (see that session update above for what changed and why).
- **Schedule builder** (`apps/extension/src/schedule/`,
  `content/scheduleInjection.ts`): plan CRUD in `planStore.ts`, conflict
  detection in `conflicts.ts` (exempts linked sections), injection logic
  extracted to `scheduleInjection.ts` for testability. Cross-listed/lab+lecture
  pairs are handled via `Section.linkedSectionKeys` and added as one atomic,
  *sequential* write (`resolveAtomicGroup` + a `for` loop, not
  `Promise.all` — concurrent writes race against the same Dexie
  read-modify-write and silently drop entries).

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

Per `V1_FEATURES_AND_TECH.md` (search "Phase 5"), not yet started:

- [ ] Per-major GE requirements dataset in `packages/catalog-snapshot`.
- [ ] Options page: major + catalog year picker, writes to settings
      (`Settings` type already has room to grow — see
      `storage/settingsStore.ts`).
- [ ] Inline GE badges on catalog pages and MyUCSC search rows.
- [ ] Double-dip detection against the user's plan/taken set.
- [ ] Standalone GE tracker extension page.
- [ ] Multi-GE assignment UI + progress summary.

No GE dataset exists yet — that's the likely first task, and probably the
best candidate to split into a parallel worktree/subagent (data-shape design)
versus the tracker UI, mirroring how Phase 4 was split (MyUCSC adapter vs.
schedule domain+UI) against a small shared type contract landed first.

## Remaining phases after this

Phase 5 (GE tracker) → Phase 6 (Google Calendar / iCal export) → Phase 7
(polish/hardening) → Phase 8 (release). Full detail for each lives in
`V1_FEATURES_AND_TECH.md`.
