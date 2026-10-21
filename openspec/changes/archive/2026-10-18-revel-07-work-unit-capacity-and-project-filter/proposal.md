# Capacity measured in work, and a filterable project picker

## Why

Release capacity was counted in TICKETS while effort was measured in SPRINTS, so
the two numbers could not be compared. On the seeded register this made a release
holding eight tickets read "8/8, at target" while it actually carried fifteen
units of work. Because every ticket cost exactly one slot, the nearest releases
always looked like they had room, and auto-optimize placed all fourteen
unscheduled tickets and reported nothing unplaced.

Separately, projects were a row of five always-visible toggle chips. That works
at five and stops working at fifteen, and it gives no way to find one.

## What Changes

- **BREAKING** A release's load is the sum of its open tickets' **estimates**, and
  capacity is expressed in the same unit. A three-sprint ticket consumes three
  units, not one ticket.
- Auto-optimize requires the ticket's **whole** estimate to fit, never exceeds
  capacity, spills to later releases when the near one has no room, and reports
  what it could not place rather than soaking it up.
- A ticket whose estimate exceeds capacity cannot be placed at all, and is
  reported as too large rather than silently dropped.
- The board shows each release's load in units with its state: room left, `FULL`,
  or over by N. Dragging can still exceed capacity — reported, not blocked.
- Projects in the editor become a **filter input over the fixed list**: type to
  narrow, click to attach, click a chip to remove. No free-text projects; the
  controlled list is preserved.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — a new requirement defines release capacity in work units;
  auto-optimize's capacity rules are restated against it; the project
  requirement covers filtering the fixed list.

## Impact

Code: `schema.ts` (`loadUnits`, `fillState`), `store.ts` (optimizer in units,
`over`/`tooBig` in the result, explanation), `Sprints.tsx`, `TicketForm.tsx`,
`styles.css`, tests.

Data: none. `commitTargetPerSprint` keeps its key and default of 8; its unit
becomes work units, where eight one-sprint tickets still fit.

Known inconsistency not fixed here: the triage decision meter still counts
decisions rather than work units, because the accept record does not carry the
ticket's estimate. Flagged for a follow-up rather than half-done.
