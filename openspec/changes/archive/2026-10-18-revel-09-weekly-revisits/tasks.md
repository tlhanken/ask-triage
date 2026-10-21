# Tasks

## Weekly dating

- [x] `REVISIT_WEEKDAY` — one place, Monday by default
- [x] `revisitInWeeks` — n = 1 is the next revisit day, from any starting day
- [x] A full week when deferring on the revisit day itself
- [x] `daysToRevisitDay` and `revisitIsDue`
- [x] `defaultRevisit` on the weekly day, replacing `defaultRevisitDays = 90`

## Coming back

- [x] `revisitFor` — the most recent defer for a ticket
- [x] `revisitDue` — deferred tickets whose day has arrived, longest waiting first
- [x] `triageQueue` — revisits lead, then the undecided, moved out of the component
      so it is testable
- [x] Triage labels a ticket that has come back

## Interface

- [x] Defer offers next week / 2 / 4 / 8, each showing the weekday and date
- [x] The prompt says why revisits are always on one day
- [x] Deferred work returns to the queue and can be accepted, declined, or deferred further

## Verification

- [x] Every choice lands on the weekly day, from a mid-week deferral
- [x] A full week when deferring on the visit day
- [x] Due on the day, not before, and still due if missed
- [x] Not in the triage queue before its day; leading it on the day; removed by
      deciding it again
- [x] Deferring again pushes the date out
- [x] 102 tests pass, typecheck and build clean

## Not done

- The revisit day is not exposed as a setting; there is no settings editor yet
