# Incident: "Add to plan" did nothing — stale `activePlanId`

**Status**: fixed, 2026-10-13. **Not a tracked doc** — this is a scratch
write-up of one incident, not something future sessions need to keep in
sync. `docs/ARCHITECTURE.md` and `docs/HANDOFF.md` are the maintained docs;
this file exists so the full diagnostic trail doesn't have to be re-derived
if the same symptom shows up again, but it can be deleted any time.

> **2026-10-18 correction — the root cause below is wrong.** The plan was
> never deleted. A content script's IndexedDB is scoped to the *page* origin,
> so the `pisa.ucsc.edu` results iframe (where the button lives) had its own
> empty `slugpath` DB, separate from the `my.ucsc.edu` panel's. Only
> `activePlanId` (in the shared `chrome.storage.local`) crossed over. The
> "fix" below therefore made the button alert "no longer exists" and clear a
> perfectly valid `activePlanId`. Real fix: plans and taken courses moved to
> `chrome.storage.local` (`storage/db.ts`). See `docs/HANDOFF.md`, session
> 2026-10-18.

## Symptom

User clicked "Add to plan" on a MyUCSC class-search result row. Nothing
happened — no alert, no error toast, no section appeared in the schedule
panel. No indication anything had even attempted to run.

## Evidence (from the user's DevTools console, pasted as a screenshot)

```
Uncaught SecurityError: Failed to read a named property 'document' from
'Window': Blocked a frame with origin "https://pisa.ucsc.edu" from accessing
a frame with origin "https://my.ucsc.edu". ...
  → pisa.ucsc.edu/cs9/pr...search&strm=2268:72

SlugPath: MyUCSC search results never loaded Err
  Error: waitForResults: no MyUCSC search results appeared within 8000ms
  (x3, from index.tsx-CX4VwbNx.js — SlugPath's own bundle)

Uncaught SecurityError: Failed to read a named property 'document' from
'Window': Blocked a frame with origin "https://pisa.ucsc.edu" from accessing
a cross-origin frame.
  → index.php:72

SlugPath: failed to add section to plan
  Error: SlugPath: cannot add section to unknown plan
  0d529983-ab64-4108-81f7-13205d788e93
  (x2, from index.tsx-CX4VwbNx.js)

Unchecked runtime.lastError: Could not establish connection. Receiving end
does not exist.
```

### Triage of each line

- **The two `SecurityError`s** (`pisa.ucsc.edu/.../search:72` and
  `index.php:72`) are **not from SlugPath**. They're MyUCSC/PeopleSoft's own
  scripts attempting cross-frame access and getting blocked by the browser's
  same-origin policy — unrelated to our code, which never touches another
  frame's `document` (only compares `window.top === window` by reference,
  which doesn't throw cross-origin). Pre-existing site noise, not a
  regression.
- **The three `waitForResults` timeouts** are from SlugPath's content script,
  but are expected/benign: `manifest.config.ts` sets `all_frames: true`, so
  the content script runs in every frame on `my.ucsc.edu`/`pisa.ucsc.edu` —
  including frames that have no search-results grid at all (the top
  `my.ucsc.edu` document, and any intermediate frames). Each of those calls
  `waitForResults`, which correctly times out after 8s and logs it. This is
  documented behavior (`content/index.tsx`'s comments), just noisy in the
  console. Not the bug.
- **`Unchecked runtime.lastError: Could not establish connection`** —
  harmless background-script noise, almost certainly unrelated (a dangling
  message port from something else, possibly another extension or a stale
  frame being torn down). Not investigated further since it isn't on the
  "Add to plan" code path (that path never calls `chrome.runtime.sendMessage`
  — only the new Google Calendar export code does, and that wasn't exercised
  here).
- **The real signal — twice, matching two click attempts:**
  ```
  SlugPath: failed to add section to plan Error:
  SlugPath: cannot add section to unknown plan
  0d529983-ab64-4108-81f7-13205d788e93
  ```
  This is `planStore.ts`'s `addSectionToPlan` throwing exactly as designed
  (`if (!plan) throw new Error(...)`) — `db.plans.get(planId)` returned
  `undefined` for the id stored in settings. **This is the bug**: the thrown
  error never reached the user, only `console.error`.

## Root cause

`settings.activePlanId` lives in `chrome.storage.local`. The `plans` table
lives in Dexie/IndexedDB. **These are two independent storage mechanisms
with no referential integrity between them.** At some point the user's
IndexedDB got cleared (most likely via DevTools → Application → IndexedDB →
delete the `slugpath` database, or a browser "clear site data" action scoped
to IndexedDB) without `chrome.storage.local` being cleared the same way —
plausible since they're different browser subsystems and "clear browsing
data" doesn't necessarily treat them identically. Result: `activePlanId`
kept pointing at `0d529983-ab64-4108-81f7-13205d788e93`, a plan that no
longer existed anywhere.

## Why this was invisible instead of just an error

Every *other* place in the codebase that reads `activePlanId` already
handles a miss gracefully, by construction — they all do
`plans.find(p => p.id === activePlanId)` and treat `undefined` as "no plan
selected":

- `schedule/SchedulePanel.tsx` — falls back to `EmptyState`.
- `ge-tracker/GETrackerPage.tsx` — `activePlan` is `undefined`, planned
  courses list is empty, no crash.
- `content/Panel.tsx` — same.
- `content/geBadgeInjection.ts` — same.

Grepped (`grep -rn "addSectionToPlan\|activePlanId"`) to confirm this before
fixing anything — see `docs/HANDOFF.md`'s session entry for the exact
command. `content/scheduleInjection.ts`'s `handleAddClick` was the **one**
call site that didn't check first: it read `activePlanId`, assumed it was
valid, and let the Dexie write throw. The click handler's
`.catch((err) => console.error(...))` then swallowed that into a
developer-only channel with nothing shown to the person who clicked the
button.

## Fix

`apps/extension/src/content/scheduleInjection.ts`, `handleAddClick`: after
the existing `!activePlanId` guard, added a check that the plan actually
exists before attempting to write to it:

```ts
if (!(await db.plans.get(activePlanId))) {
  useSettingsStore.getState().setSettings({ activePlanId: null })
  window.alert('SlugPath: your active plan no longer exists — select or create one in the panel, then try again.')
  return
}
```

This both surfaces the problem (an alert, same convention as the existing
"select or create a plan first" alert right above it) and self-heals —
clearing `activePlanId` means every other panel's existing
`plans.find(...) → undefined` fallback immediately shows the normal "no plan
selected" state instead of staying stuck pointing at a dead id forever.

Fixed at the one broken call site, not in `planStore.ts` (already correctly
throwing — that's the right behavior for a storage-layer function) and not
by adding redundant checks to the four call sites that already handle this
correctly.

## Test added

`apps/extension/src/content/scheduleInjection.test.ts`:
> "clicking with a stale activePlanId (the plan was deleted out from under
> it) alerts, self-heals, and writes nothing"

Sets `activePlanId` to an id with no corresponding `db.plans` row, clicks the
button, asserts: the alert fires with the "no longer exists" message,
`activePlanId` is cleared back to `null` in the store, and no plan rows exist
afterward.

## Verification

- `pnpm lint` — clean.
- `pnpm typecheck` — clean.
- `pnpm test` — 147/147 (was 146 before this fix's new test).
- `pnpm build` — clean, `dist/` regenerated.
- Not re-verified live against real MyUCSC after this specific fix (would
  need the user to reproduce the exact dangling-id state again, which the
  fix itself now prevents from recurring in the same way).

## What the user needs to do

1. Reload the extension in `chrome://extensions` (same extension id, no need
   to remove+reload) to pick up the rebuilt `dist/`.
2. The sections that were in the deleted plan are unrecoverable — they were
   never written to a plan that still exists. Click "Add to plan" once more
   to trigger the new alert and clear the stale `activePlanId`, then use
   "+ New plan" in the panel and re-add sections.

## Possible follow-up (not done, not asked for)

The same "content-script write throws, `.catch` only logs to console"
pattern could in principle exist for other write paths added later. Worth a
quick grep for `.catch((err` / `.catch((err: unknown)` across `content/*.ts`
next time one of those is touched, to check whether failures there are
user-visible or console-only. Not chased further now — no other current
write path has this specific "id that can go stale" shape to trigger it.
