# Weekly revisits, and deferred work that actually comes back

## Why

Two problems, and the second is the one that mattered.

The revisit date was day-granular and defaulted to 90 days out, so deferring
something produced an arbitrary weekday three months later — a trickle of daily
nags rather than a batch.

Worse: nothing ever read the date back. `revisit` lived on the decision record,
was printed in the Decisions view and the markdown export, and no code path
consulted it. A deferred ticket left the triage queue and never returned. The
field was decoration, which is exactly the failure this register exists to
avoid.

## What Changes

- Revisits are chosen in **whole weeks** (next week, 2, 4, 8) instead of an
  arbitrary date.
- Every revisit lands on the **same day of the week** (Monday by default, one
  constant to change), so deferred work arrives in one batch with the weekly
  triage rather than trickling in daily.
- Deferring on the revisit day itself gives a full week, not today.
- Deferred tickets whose revisit day has arrived **return to the triage queue**,
  ahead of undecided work, and are labelled as having come back.
- Deciding one again — accept, decline, or defer further — clears it, and
  deferring again pushes the date out.
- `defaultRevisitDays = 90` is replaced by a four-week default on the weekly day.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — a new requirement defines weekly revisits and the return of
  deferred work to the decision queue.

## Impact

Code: `schema.ts` (`REVISIT_WEEKDAY`, `revisitInWeeks`, `revisitIsDue`,
`daysToRevisitDay`), `store.ts` (`defaultRevisit`, `revisitFor`, `revisitDue`,
`triageQueue`), `Triage.tsx`, tests.

Data: none. The revisit still lives on the decision record; it is now read.
