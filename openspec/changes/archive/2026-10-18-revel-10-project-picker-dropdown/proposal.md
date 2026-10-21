# A project picker that holds up at a few hundred projects

## Why

The picker rendered every matching project as a chip underneath the field. That
is fine at five projects and unusable at five hundred: the row becomes a wall, it
pushes the form around as it grows, and it competes for attention with the chips
that show what is actually attached.

## What Changes

- Suggestions move into a **dropdown attached to the search field**, overlaying
  rather than pushing the form around, with a bounded height that scrolls.
- Chips are now only for **what is attached**.
- The dropdown renders at most `PROJECT_SUGGESTION_CAP` (50) suggestions and
  states how many matched in total, so a long list narrows rather than truncates
  silently.
- Prefix matches rank above substring ones, so typing `plat` offers `Platform`
  before `WebPlatform`.
- Keyboard: up/down to move, enter to pick, escape to close, and nothing is
  pre-selected, so enter on an empty query does nothing.
- The input gains an accessible label, which it did not have.
- The project view's per-project tallies are computed in **one pass over the
  tickets** instead of one full scan per project.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — the project requirement now covers a bounded suggestion
  list, and a new scenario covers scale.

## Impact

Code: `schema.ts` (`matchProjects`, `PROJECT_SUGGESTION_CAP`), `TicketForm.tsx`,
`Projects.tsx`, `styles.css`, tests.

Data: none.
