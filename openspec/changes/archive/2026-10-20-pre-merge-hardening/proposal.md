# Pre-merge hardening: nothing the app does may be a dead end

## Why

`data/register.json` is untracked on purpose, so it is the only copy of every
real ask. A review of the branch found several ways to lose it, or part of it,
without any warning, and a class of date bugs that showed people the wrong day:

- **Reset was a dead end.** One confirm click, sitting in the header next to
  "+ New ticket", replaced the register with demo data and emptied the history.
  It then autosaved over the file. The empty-write guard let that through,
  because the demo has 14 tickets.
- **Deleting a ticket erased its decisions.** Revert restores tickets but by
  design never rewrites the decision log. So a deleted-then-restored deferred
  ticket lost its revisit date and never came back to triage.
- **The file was written in place.** A crash mid-write would have left it
  truncated.
- **Any web page could overwrite it.** A form POST or a text/plain fetch is a
  "simple" request: the browser sends it cross-origin without asking first.
- **The load paths disagreed.** Browser storage was validated. The two file
  paths only checked that `tickets` was an array.
- **Stored UTC timestamps were read as local dates.** That broke the
  scope-after-freeze count, export headings and filenames, and the times shown
  in History and Decisions. "N days from now" was also computed in 24-hour
  blocks, which lands on the wrong date across a DST change.

## What Changes

- Reset is recorded in History and can be reverted. It keeps the decision log,
  gives the demo tickets fresh ids, and lives on the History tab.
- Deleting a ticket leaves its decisions in place: the decision log is
  append-only.
- The register file is written to a temp file and then renamed over the
  original.
- The file endpoint refuses a write that is not sent as JSON (415), or that
  comes from another origin (403), before reading the body. It matches its path
  exactly.
- `readStore()` is the one way in for every load path: parse, validate, migrate.
  Anything else is refused whole.
- Stored timestamps are shown and compared as local dates and times.
  "N days from now" counts calendar days. A move made on the freeze day counts
  as scope after freeze, because the release is frozen that day.
- ESLint runs in CI, alongside the typecheck and the tests.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking`: four new requirements state rules the code now follows:
  the decision log is append-only, the register file is written safely, every
  load path reads the same way, and dates are local.

## Impact

Code: `store.ts` (`resetToSeed`, `deleteTicket`, `readStore`, `slippedIn`,
`fillReleaseDates`), `schema.ts` (`addDays`, `localStamp`, `daysUntil`),
`server/localData.ts`, `exporters.ts`, `seed.ts`, `App.tsx`, `History.tsx`,
`Decisions.tsx`, `keys.ts`, ESLint config, CI. The test suite is pinned to a
negative UTC offset so CI, which runs in UTC, can see the date class.

Data: none. The live register reads unchanged.
