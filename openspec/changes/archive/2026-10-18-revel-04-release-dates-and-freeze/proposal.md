# Give every release a freeze date and a release date

## Why

A release without dates cannot be reasoned about: "which release can take this?"
turns into guesswork, and nothing stops scope arriving the day before a ship.
Adding two dates to each release makes both answerable — and lets the board say
plainly when work arrives after the freeze instead of pretending it did not.

## What Changes

- A release is now `{ name, freeze, release }` rather than a bare name. Both dates
  are editable from the board by clicking the release name.
- A release is **frozen** once its freeze date arrives. Work can still be added to
  a frozen release; doing so raises a **scope after freeze** notice naming the
  freeze date and how long ago it was, and the column shows a running count of
  what arrived after freeze.
- Auto-optimize now reasons from dates: it skips releases that have shipped and
  releases that are frozen, fills by **release date** rather than by name order,
  prefers the earliest release that ships **on or before** a ticket's due date,
  and flags the proposal when no release ships in time.
- No new ticket fields. Freeze and release dates live on the release (two values,
  not two hundred), and "what slipped in" is derived from the recorded move
  history rather than stored per ticket.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — releases gain dates (the version-sprints requirement), one
  requirement is added for freeze and scope-after-freeze, and auto-optimize's
  requirement gains the date-driven rules.

## Impact

Code: `schema.ts` (`Sprint`, `defaultSprints`, `isFrozen`, `hasShipped`,
`daysToRelease`, `sprintNames`, `findSprint`), `store.ts` (release CRUD,
`slippedIn`, `op` on history entries, optimizer rewrite, migration),
`SprintForm.tsx` (new), `Sprints.tsx`, `App.tsx`, `styles.css`, tests.

Data: existing saves are migrated in place — release names become releases with
empty dates — so no history or tickets are lost.
