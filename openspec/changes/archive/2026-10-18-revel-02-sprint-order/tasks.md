# Tasks

## Model and store

- [x] Default sprint order is newest release first
- [x] `shiftSprint(store, name, delta)` swaps a sprint with its neighbour and
      refuses to move past either end
- [x] `addSprint` slots a new sprint by version instead of re-sorting the list
- [x] No new stored field; the sprint array remains the single source of order

## Interface

- [x] Board renders backlog, then sprints in stored order
- [x] Each sprint column head carries left/right controls, disabled at the ends
- [x] Column head controls restyled from a single absolutely-positioned button
      to an inline control group

## Verification

- [x] Typecheck passes (`tsc --noEmit`)
- [x] 44 tests pass, including default column order, reorder left/right, and
      both boundary cases
- [x] Production build succeeds
