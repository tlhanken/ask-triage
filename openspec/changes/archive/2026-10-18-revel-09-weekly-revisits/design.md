# Design — a batch, not a trickle, and a date that is actually read

## Why weekly

A day-granular revisit for a few hundred open asks produces a trickle arriving
five mornings a week. Each one interrupts, none of them justifies a session, and
the practical result is that they get skimmed and re-deferred. Weekly revisits
arrive together, on the day the weekly triage already runs, so deferring costs
one decision now and one look later.

The day is Monday by default because the revisit should land on the same slot as
the ritual that processes it. If revisits landed mid-week you would either act on
them ad hoc, defeating the batch, or let them sit until Monday — in which case
naming Monday is just being honest about what happens anyway.

It is one exported constant (`REVISIT_WEEKDAY`), not a settings field. There is
no settings editor in the app, so a configurable value nobody can configure is
worse than an obvious one they can change in a line.

## Counting weeks from the day, not from +7

"In 1 week" from a Wednesday could mean +7 days (the following Wednesday) or the
next revisit day. The second is what the batching is for, so `revisitInWeeks(1)`
is *the next* revisit day: five days away from a Wednesday, seven from a Monday.
Deferring on the revisit day itself yields a full week rather than the same day,
which would make the deferral a no-op.

## The date was never read

The substantive fix. `revisit` was written to the decision log and displayed, and
nothing consulted it, so a deferred ticket was parked permanently. Deferral is
supposed to be explicit and reversible; a deferral that can never be revisited is
not a park, it is a quiet decline.

So `revisitDue` reads it back — the most recent defer for a ticket, due once its
day has arrived — and `triageQueue` puts those ahead of undecided work, since
they have waited longest. The queue composition moved out of the component into
`store.ts` precisely so this claim is testable rather than asserted in a comment.

Deferring again pushes the date out, because the most recent defer wins. That is
what makes re-deferring meaningful instead of leaving the original date armed.

## A probe bug worth recording

Verifying by hand, dates built with `new Date("2026-11-02")` parse as UTC midnight
and, in a negative-offset timezone, land a day early — which made a revisit look
like it was not due on its own day. The app was right: `parseDate` builds LOCAL
dates deliberately, with a comment about the UTC off-by-one on evening edits. Any
test or probe that builds a date from a string must go through `parseDate`, or the
result is silently a day out.
