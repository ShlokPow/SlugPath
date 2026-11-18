# SlugPath Privacy Policy

_Last updated: 2026-10-12_

SlugPath is a Chrome extension that helps UCSC students plan course schedules,
check prerequisites and track general-education requirements. It has no
backend server, no user accounts and no analytics.

## What SlugPath stores, and where

Everything SlugPath saves is stored **on your own computer**, in the
browser's own extension storage:

| Data | Where it lives | Why |
|---|---|---|
| Your schedule plans (courses and sections you picked) | Chrome extension storage, in your browser profile | So a plan survives closing the tab or restarting Chrome |
| Courses you've already taken, and the term you took them | Chrome extension storage, in your browser profile | Prerequisite and GE-requirement checks |
| Your settings — major, catalog year, active plan, GE assignments, whether you linked a Google account | `chrome.storage.local`, in your browser profile | So the extension behaves the same in every tab |

None of it is transmitted anywhere. It is not synced across devices. It is
deleted when you remove the extension, and you can clear individual entries
from the extension's own options page.

## What SlugPath reads from UCSC pages

SlugPath runs only on `my.ucsc.edu` and `pisa.ucsc.edu`. On those pages it
reads the parts of the page you are already looking at:

- Class-search result rows (course code, section, meeting time, room,
  instructor, open seats) — so it can add a section to a plan and show
  prerequisite and GE information next to it.
- Your Degree Progress Report, **only when you click "Import GE completions"**
  — so your satisfied GE requirements and completed courses can be recorded
  locally instead of typed in by hand.

This reading happens entirely inside your browser. SlugPath does not log in
for you, does not store your UCSC credentials, and never sends any part of a
UCSC page off your machine.

## Google Calendar

Exporting a plan to Google Calendar is optional and off by default.

If you use it, SlugPath asks Chrome for a Google authorization token
(`chrome.identity`) limited to the single scope
`https://www.googleapis.com/auth/calendar.events`, then sends **only the
events it is creating** — course code and section, meeting time, room,
instructor name, and the plan's name — directly from your browser to Google's
Calendar API. SlugPath cannot read your existing calendar, and nothing passes
through any server operated by SlugPath, because there isn't one.

You can revoke this at any time: **Unlink** on SlugPath's options page clears
the cached token, and you can also remove SlugPath's access from your
[Google account permissions page](https://myaccount.google.com/permissions).

The `.ics` export sends nothing anywhere — it builds the file in your browser
and downloads it.

## What SlugPath never does

- No analytics, telemetry, crash reporting or advertising.
- No selling or sharing of data — there is no data collection to sell or
  share.
- No off-device storage of anything, including your plans, taken courses or
  settings.
- No access to your UCSC grades or transcript beyond the Degree Progress
  Report content you explicitly import.

## Course catalog data

The UCSC course catalog ships inside the extension as a bundled, compressed
snapshot. Looking up a course does not make a network request and does not
tell anyone which course you looked at.

## Contact

Questions or a problem to report: open an issue at
<https://github.com/ShlokPow/SlugPath>.
