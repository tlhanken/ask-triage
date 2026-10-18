# Design — sprint board order

## Decisions

### Newest release on the left

The board is read left to right, so the leftmost position is the one that gets
seen. Work that is about to ship belongs there, not last year's release. The
backlog stays leftmost of all: it is unscheduled intake, and putting it left of
the newest release keeps "not yet placed" adjacent to "next", which is the
direction work actually travels.

### Reorder by control, not by drag

Each column head carries a left and a right control. Drag-and-drop is nicer to
use but cannot be driven deterministically in a headless test, so it would ship
unverified; the controls are click, keyboard-reachable, and covered by tests
that assert the resulting column order. Drag can be layered on later without
changing the stored shape, because the order is already just an array.

### No new setting for direction

The tempting move is a `sortDirection` setting. That would be a second source of
truth for the same fact: the array is already an ordered list, and a direction
flag can contradict the order it is supposed to explain. The array is the order,
full stop — consistent with the field discipline this repository adopted in
`revel-01`.

### Slotting a new sprint without clobbering the order

`addSprint` previously appended and re-sorted the whole list, which is invisible
while the list is in version order and destructive once the owner has rearranged
it. It now inserts at the first position where the new name is still newer than
the entry there, or at the end if it is the oldest. Adding is therefore additive.

## Consequences

- Ordering is a user action with a persisted result, so the board can reflect
  release reality rather than version arithmetic.
- `shiftSprint` is a pure store transition and is unit tested at both boundaries.
