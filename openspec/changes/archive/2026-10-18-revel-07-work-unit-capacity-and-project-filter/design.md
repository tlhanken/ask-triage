# Design — capacity has to be a real quantity

## The defect

`commitTargetPerSprint` is 8 and was applied to a count of tickets. `estimate` is
1-3 sprints and was applied to a due-date check. Nothing compared them.

So the tool could say a release was at its target while it held triple the work,
and `unplaced: 0` while it was proposing 24 units of work into releases that
between them could absorb less. That is the mechanism behind "auto-optimize just
shoves everything to ASAP": with every ticket costing one slot, the earliest
release never looks full until eight tickets have landed regardless of size.

## Load is work

A release's load is now the sum of its open tickets' estimates, and capacity is
in the same unit. This also gives the estimate a THIRD consumer, which is the
test a field has to pass to be stored at all: it already replaced a t-shirt size
and supports "this will not fit before its due date"; it now also drives capacity
and the fullness flag.

## Cost-aware placement

The old room test was `load < capacity`. The new one is
`load + estimate <= capacity` — the whole ticket has to fit. Two consequences,
both intended:

- A release with 2 units left will not take a 3-unit ticket, even though it is
  not nominally "full". The proposal decentralises to a later release that can.
- The optimizer reaches "nothing more fits" far sooner, so it stops and reports
  the tail instead of soaking up every release. On the seed this is the
  difference between 14 placed and 12 placed with 2 reported.

Two tickets that could never be placed — because a single estimate exceeds
capacity entirely — are counted separately as too large, so they are named
rather than quietly dropped.

## Fullness is reported, never enforced

Dragging work into a full release is still allowed and shown as over. This
follows the freeze rule already established: blocking late work does not stop it
happening, it only pushes the truth out of the tool. A full release is a
statement about the plan, not a lock on the board.

FULL and over are distinguished in text ("FULL" versus "over by 3") rather than
by inventing a near-full threshold. The honest leading indicator is the room
count itself — "2 left" is the warning, and any percentage cutoff would be a
policy the tool made up.

## Projects as a filtered list

The chips were replaced with an input that filters the fixed `PROJECTS` array,
because the requirement that projects come from a controlled list is worth more
than the convenience of free text — a free-text project silently destroys the
project view. Typing narrows, clicking attaches, Enter takes the first match so
the editor stays keyboard-first, and the empty state says the list is fixed.
