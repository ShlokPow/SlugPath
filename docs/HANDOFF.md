# Handoff — start of Phase 5

Status snapshot as of `main` @ `41c9b52` (2026-08-16). Phases 0–4 are done,
merged to `main`, and pushed. `iteration` is fast-forwarded to match `main` —
both branches point at the same commit. This doc exists so a fresh session
can pick up Phase 5 without re-deriving the last few sessions' context.

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
- **Prereq graph** (`apps/extension/src/prereq-graph/`): React Flow + dagre.
  `graphModel.ts`'s `unwrapConstraints()` already generically renders any
  childless `constraint` node as a labeled "raw" fallback node — new
  constraint types (like `placementScore`) need no graph-layer changes.
- **MyUCSC adapter** (`apps/extension/src/adapters/myucsc.ts`): the single
  module owning MyUCSC DOM selectors, per the spec's non-negotiable
  selector-abstraction requirement. Exports `parseSearchResults`,
  `getCurrentTerm`, `waitForResults`. Day codes: M/T/W/F single letters, `Th`
  for Thursday.
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
