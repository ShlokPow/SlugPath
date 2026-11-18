# SlugPath Chrome Web Store listing draft

Draft for the Chrome Web Store submission. Every factual claim below was checked
against `docs/privacy-policy.md` and the code. Claims that do not match the
policy are listed in section 6 and must be resolved before submission. The
policy itself is not edited here.

Code references are to `release/v1-prep` after Wave 1 (narrowed host
permission, major picker removed). The Google Calendar wording assumes T2.1
has landed (Google controls hidden in builds without an OAuth client); M6 says
what the code does today.

## 1. Short description

> Plan UCSC class schedules, check prerequisites and track GE requirements on MyUCSC. Plans are stored on your device.

Character count: 116 (limit 132).

## 2. Long description

SlugPath adds planning tools to the UCSC class-search pages on MyUCSC, so you
can build a schedule without leaving the page you are already on.

- **Add to plan.** Each class-search result row gets an "Add to plan" button.
  Clicking it adds that row's section to the active plan.
- **Weekly schedule panel.** A collapsible panel on the page shows your plan as a weekly grid and
  highlights time conflicts between sections.
- **Multiple plans.** Keep several named plans, switch between them, duplicate
  one, or delete one.
- **Prerequisite check.** Each row has a popover that shows the prerequisites for
  that course and whether you have already taken them.
- **GE tracking.** Rows show general-education badges, and a summary widget shows
  which GE requirements your plan and completed courses satisfy. A standalone GE
  tracker page gives the same view outside of class search.
- **Degree Progress Report import.** On your Degree Progress Report, an "Import GE
  completions" button copies your satisfied GE requirements and completed courses
  into SlugPath. SlugPath reads the GE data only after you click the button; before
  that, it only looks for the GE section heading on the page to place the button.
- **Calendar export.** Download your plan as an .ics file for any calendar app.
  Google Calendar export is optional and is included only in builds configured with
  a Google OAuth client. It runs only when you click "Add to Google Calendar" and
  confirm, or click "Retry" to resend events that failed.

Everything SlugPath saves is stored on your device, in Chrome's extension
storage. Nothing is sent to a SlugPath server, because there is no SlugPath
server. The UCSC course catalog ships inside the extension, so looking up a
course makes no network request.

SlugPath does not log in for you, does not store your UCSC credentials, and
has no analytics, accounts or advertising.

Privacy policy: link to the hosted version of `docs/privacy-policy.md`
(hosting URL not yet set; unverified).

Support: https://github.com/ShlokPow/SlugPath (unverified; the issue tracker
named in the policy).

## 3. Single-purpose statement

SlugPath helps UCSC students plan class schedules, check prerequisites and track
general-education requirements on UCSC's MyUCSC and class-search pages.

## 4. Permission justifications

**storage.** SlugPath uses `chrome.storage.local` to keep your plans, the courses
you have taken (with the term), and your settings (including the active plan, GE
assignments, the GE codes and time of your last Degree Progress Report import, and
whether you linked a Google account) on your device. That is how a plan survives
closing the tab or restarting Chrome. The code also uses `chrome.storage.session`
to hold a Google access token while you are linked; per Chrome's storage
documentation (unverified here), that data is kept in memory and not written to
disk. Stored data leaves the device only as part of a Google Calendar export you
start: the token authorizes the request and the exported events come from your
plan.
(`apps/extension/src/storage/db.ts:23-28`,
`apps/extension/src/storage/settingsStore.ts:5-23`,
`apps/extension/src/export/googleCalendar.ts:41,60,65`.)

**identity.** SlugPath uses `chrome.identity.launchWebAuthFlow` to sign you in to
Google, and only when you choose to link Google Calendar on the options page or
click "Add to Google Calendar". The request asks for one scope,
`https://www.googleapis.com/auth/calendar.events`. Without this permission the
Google Calendar option cannot work. The .ics export does not use it.
(`apps/extension/src/export/googleCalendar.ts:54`, `manifest.config.ts` oauth2
block.)

**Host permission `https://www.googleapis.com/calendar/*`.** The Calendar API is
the only remote host the extension's code calls with `fetch`. It is used to create
the events you choose to export to Google Calendar, one POST per event to
`/calendar/v3/calendars/primary/events`. SlugPath does not read, list or update
existing events. The request is made directly from your browser. Sign-in is
separate: it opens `accounts.google.com` through `chrome.identity.launchWebAuthFlow`
(`apps/extension/src/export/googleCalendar.ts:45,54`). (`apps/extension/src/export/googleCalendar.ts:8,88-89`.)

**Content script host `my.ucsc.edu`.** SlugPath's content script runs on
`https://my.ucsc.edu/*` in every frame (`manifest.config.ts` `all_frames: true`).
According to the extension's code comments, MyUCSC renders class-search results
inside a nested frame. On those pages it reads the class-search result rows
(course code, section, meeting time, room, instructor, open seats) to add the
"Add to plan" button, prerequisite popover and GE badges, and it reads the Degree
Progress Report only after you click "Import GE completions". Before that click it
only looks for the GE section heading to place the button. It does not change your
enrollment, log in for you, or send page content anywhere.
(`manifest.config.ts` content_scripts; `apps/extension/src/content/scheduleInjection.ts`,
`apps/extension/src/content/degreeProgressImport.ts`, `apps/extension/src/adapters/myucsc.ts`.)

**Content script host `pisa.ucsc.edu`.** According to the extension's code
comments, MyUCSC loads its class-search results grid from `https://pisa.ucsc.edu/*`
in a frame. The content script must also run there so the "Add to plan" buttons and
the prerequisite popover appear in that grid. It reads and displays the same
class-search row data as on `my.ucsc.edu` and sends nothing off the device.
(`manifest.config.ts` content_scripts comment.)

## 5. Data-usage answers

Use these answers in the store's data-disclosure form. The disclosure must be
completed by the account owner in the Chrome Web Store dashboard; this section
only records what the answers should be.

**Data collected by the developer:** none. SlugPath has no backend, no
accounts and no analytics (policy: "no backend server, no user accounts and no
analytics").

**Data handled on your device:** your schedule plans (the sections you add,
including the open-seat count at the time you added them),
the courses you have taken and their terms, the GE data imported from the Degree
Progress Report, and your settings. The class-search rows you view are not stored.
None of it leaves the device except as described under "Data sent to a third
party" below, and it is not synced across devices.

**Data sent to a third party:** only when you choose Google Calendar export, the
events SlugPath creates (course code and section, meeting time, room, instructor
name, and the plan's name) are sent from your browser directly to Google's
Calendar API. No SlugPath server is involved. The .ics export sends nothing.
Confirm how the form categorizes this user-initiated transfer; the category name
used by the form is unverified.

**Certifications:**
- Not sold to third parties, apart from the approved use cases. True: nothing is
  sold, and nothing is transferred except the user-initiated Google Calendar
  export above.
- Not used or transferred for purposes unrelated to the single purpose. True:
  data is used only to plan schedules, check prerequisites and track GE
  requirements.
- Not used or transferred to determine creditworthiness or for lending
  purposes. True: no such use exists.

## 6. Policy/code mismatches

Each entry quotes the policy sentence, states what the code does, and proposes
the fix. All nine fixes were applied to `docs/privacy-policy.md` on 2026-11-18;
the policy line numbers below refer to the version before that edit.

**M1. Settings row lists "major".**
- Policy (table row, line 18): "Your settings — major, catalog year, active plan, GE assignments, whether you linked a Google account — `chrome.storage.local`".
- Code: the options page has no major picker. It shows catalog year as display text from `version.json` (`apps/extension/src/options/Options.tsx:14-18`). `catalogYear` is never written: it appears only as the default (`apps/extension/src/storage/settingsStore.ts:7`) and as the type (`apps/extension/src/storage/types.ts:41`). `majorCode` defaults to `null` (`apps/extension/src/storage/settingsStore.ts:6`) and nothing in `apps/extension/src` writes it. The GE tracker still reads it for per-major DC course checks (`apps/extension/src/ge-tracker/geProgress.ts:58`).
- Code (cont.): the row also omits stored settings the code writes: the GE codes and time of the last Degree Progress Report import (`apps/extension/src/content/degreeProgressImport.ts:40-43`).
- Fix: remove "major" from the row, change "catalog year" to "catalog year (display only, not stored)", and add "the GE codes and date of your last Degree Progress Report import". With `majorCode` always `null`, DC checks use an empty course list (`geProgress.ts:58`), the same as a fresh install.

**M2. "SlugPath cannot read your existing calendar."**
- Policy (Google Calendar section, line 49): "SlugPath cannot read your existing calendar, and nothing passes through any server operated by SlugPath".
- Code: the only Google Calendar request is a POST to the events endpoint (`apps/extension/src/export/googleCalendar.ts:8,88-89`). There is no list or get call. The scope `calendar.events` does allow reading; per Google's scope documentation (unverified here), it covers "View and edit events on all your calendars". So the sentence is accurate about the code but not about the permission.
- Fix: replace with "SlugPath only creates the events you export. It never lists or reads events already on your calendar." Keep the second clause.

**M3. Google access token storage is not disclosed.**
- Policy (table, lines 14-18): lists plans, taken courses and settings only. The Google Calendar section (lines 44-45) mentions the token from `chrome.identity` but not where it is kept.
- Code: the access token is stored in `chrome.storage.session` (`apps/extension/src/export/googleCalendar.ts:41,60,65`). Only the boolean `calendarLinked` is in `chrome.storage.local` (written from `apps/extension/src/options/Options.tsx:21` and `apps/extension/src/schedule/ExportControls.tsx:55`).
- Fix: add a row to the table: "Google access token (only after you link Google Calendar) — `chrome.storage.session`, held in memory and cleared when Chrome closes or you unlink". Confirm the session-storage lifetime against current Chrome docs before publishing. The in-memory and cleared-when-Chrome-closes lifetime claim is unverified in this draft.

**M4. "clear individual entries from the extension's own options page".**
- Policy (lines 21-22): "you can clear individual entries from the extension's own options page".
- Code: the options page removes taken courses (`apps/extension/src/options/Options.tsx:123-126`) and unlinks Google (`Options.tsx:43-44`). Schedule plans are deleted from the schedule panel's Delete button with a confirm (`apps/extension/src/schedule/SchedulePanel.tsx:52-58`, confirm at line 54). Plans are not removed from the options page.
- Fix: "you can remove individual courses and unlink Google on SlugPath's options page, and delete plans from the schedule panel."

**M5. Exported event fields are slightly incomplete.**
- Policy (lines 47-48): "course code and section, meeting time, room, instructor name, and the plan's name".
- Code: the POST body also includes the recurrence rule (`RRULE:FREQ=WEEKLY;BYDAY=...;COUNT=...`, line 83) and the time zone (`America/Los_Angeles`, from `UCSC_TIME_ZONE`, lines 81-82) (`apps/extension/src/export/googleCalendar.ts:76-85`, `apps/extension/src/export/events.ts:10`).
- Fix: add "the recurrence pattern and time zone" to the list. Optional.

**M6. "off by default" wording for Google export.**
- Policy (line 42): "Exporting a plan to Google Calendar is optional and off by default."
- Code: the "Add to Google Calendar" button is always rendered in the export controls (`apps/extension/src/schedule/ExportControls.tsx:106-107`). It does nothing until you click it and confirm (`ExportControls.tsx:76`); the "Retry N failed" button resends failed events without a second confirm (`ExportControls.tsx:109-113`). In a build without an OAuth client id, the click errors (`apps/extension/src/export/googleCalendar.ts:20-30`). T2.1 will hide the button in such builds; this listing text assumes T2.1 has landed.
- Fix: "Google Calendar export is optional. It runs only when you click 'Add to Google Calendar' and confirm, or click 'Retry' to resend events that failed in that export. It is available only in builds configured with a Google OAuth client." The phrase "off by default" is accurate as a description of behavior, but the wording above is more precise.

**M7. Google sign-in page is not named.**
- Policy (Google Calendar section, lines 44-46): names `chrome.identity` and the Calendar scope, but not the Google sign-in page SlugPath opens.
- Code: sign-in opens `https://accounts.google.com/o/oauth2/v2/auth` through `chrome.identity.launchWebAuthFlow` (`apps/extension/src/export/googleCalendar.ts:45,54`).
- Fix: mention the Google sign-in page, for example: "To sign in, SlugPath opens Google's sign-in page (accounts.google.com) through Chrome's identity API."

**M8. Degree Progress Report read is overstated.**
- Policy (lines 32-33): "Your Degree Progress Report, **only when you click "Import GE completions"**".
- Code: on page load, the content script scans the page for the "GENERAL EDUCATION REQUIREMENTS" section header and injects the button there (`apps/extension/src/content/degreeProgressImport.ts:12-18, 48-50, 72-75`). The GE data is parsed only in the click handler (`degreeProgressImport.ts:58-63`). So the header scan is a read of page content that happens before the click.
- Fix: "SlugPath looks for the GE section heading on your Degree Progress Report to place its button, and reads the GE data only when you click 'Import GE completions'."

**Checked and consistent (no action):** `chrome.storage.local` for plans, taken courses and settings (`db.ts:23-28`, `settingsStore.ts:17-23`); no analytics; network calls are the Google Calendar POST (`googleCalendar.ts:88-89`) and the Google sign-in page opened through `chrome.identity` (`googleCalendar.ts:45,54`); .ics export is a local Blob download (`ExportControls.tsx:35-41`); Degree Progress Report GE data is parsed only in the import click handler (`degreeProgressImport.ts:58-63`); Unlink clears the cached token (`googleCalendar.ts:72-74`, `Options.tsx:43-44`); open seats are read from class-search rows (`adapters/myucsc.ts`).

**M9. "None of it is transmitted anywhere."**
- Policy (line 20): "None of it is transmitted anywhere."
- Code: plan data (course code, section, meeting time, room, instructor, plan name) forms the Google Calendar POST bodies, sent with the stored token (`apps/extension/src/export/events.ts:107-116`, `apps/extension/src/export/googleCalendar.ts:76-91`).
- Fix: "None of it is transmitted anywhere, except the events you choose to export to Google Calendar (see below)."
