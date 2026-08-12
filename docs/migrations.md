# Storage migrations

SlugPath has two persisted stores, each with its own migration procedure.

## Dexie (`apps/extension/src/storage/db.ts`)

Schema lives in `SlugPathDB`'s constructor as a chain of `this.version(n).stores({...})` calls. Dexie keeps every version in the chain and upgrades a user's existing database step by step, so **never edit an already-shipped `.version()` block** — add a new one.

To change the schema:

1. Add a new `this.version(N + 1).stores({ ... })` call after the last one, where `N` was the previous highest version. Only list tables/indexes that changed — Dexie carries forward untouched ones automatically.
2. If existing rows need transforming (renamed/reshaped field, backfilled default), chain `.upgrade((tx) => { ... })` off that same `.version()` call to migrate rows in place.
3. Bump `apps/extension/package.json`'s version — the extension version and catalog snapshot version are meant to move together per the tech spec.
4. Add a test in `db.test.ts` covering the new shape.

Example (hypothetical): adding an index on `plans.name`:

```ts
this.version(1).stores({
  plans: 'id, term, updatedAt',
  takenCourses: 'courseCode, term',
  catalogCache: '[courseCode+catalogYear], courseCode, fetchedAt',
})
this.version(2).stores({
  plans: 'id, term, updatedAt, name',
})
```

## `chrome.storage.local` settings (`settingsStore.ts` / `useSettingsStore.ts`)

Settings are a single JSON blob under one storage key (`SETTINGS_STORAGE_KEY`), not versioned individually. The convention:

- **Additive fields** (new optional setting): add it to the `Settings` type and to `DEFAULT_SETTINGS`. `getSettings()` already merges `DEFAULT_SETTINGS` under whatever is stored, so existing users get the new field's default with no explicit migration step.
- **Breaking changes** (renamed/removed/reshaped field): write a one-time transform at the top of `getSettings()` that detects the old shape (e.g. a missing/old-typed field) and maps it to the new `Settings` shape before merging with defaults, then `setSettings()` the result so the transform only runs once. Delete the transform once you're confident no installed base still has the old shape.

There is no schema-version counter for settings today — the "detect old shape, coerce, re-save" pattern above is deliberately the whole mechanism, since a single flat settings object rarely needs more. Revisit if settings gain enough history that shape-sniffing becomes ambiguous.
