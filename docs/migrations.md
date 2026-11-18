# Storage migrations

SlugPath persists everything in `chrome.storage.local`: two keyed collections plus the settings blob.

## Collections (`apps/extension/src/storage/db.ts`)

`plans` and `takenCourses` are each one `{ [key]: item }` object in `chrome.storage.local`. There is no schema to version — same convention as settings below: additive optional fields need nothing (treat a missing field as its default at the read site); a reshaped field gets a one-time "detect old shape, coerce, re-save" pass in `Collection`'s read path. Add a test in `db.test.ts` for any such transform.

## `chrome.storage.local` settings (`settingsStore.ts` / `useSettingsStore.ts`)

Settings are a single JSON blob under one storage key (`SETTINGS_STORAGE_KEY`), not versioned individually. The convention:

- **Additive fields** (new optional setting): add it to the `Settings` type and to `DEFAULT_SETTINGS`. `getSettings()` already merges `DEFAULT_SETTINGS` under whatever is stored, so existing users get the new field's default with no explicit migration step.
- **Breaking changes** (renamed/removed/reshaped field): write a one-time transform at the top of `getSettings()` that detects the old shape (e.g. a missing/old-typed field) and maps it to the new `Settings` shape before merging with defaults, then `setSettings()` the result so the transform only runs once. Delete the transform once you're confident no installed base still has the old shape.

There is no schema-version counter for settings today — the "detect old shape, coerce, re-save" pattern above is deliberately the whole mechanism, since a single flat settings object rarely needs more. Revisit if settings gain enough history that shape-sniffing becomes ambiguous.
