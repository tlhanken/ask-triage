# Tasks

## Capacity in work units

- [x] `loadUnits` — a release's load is the sum of its open tickets' estimates
- [x] `fillState` — room / full / over, with the room left
- [x] Optimizer load is work, not head count
- [x] Room test requires the whole estimate to fit
- [x] Spills to a later release instead of overfilling the earliest
- [x] Stops and reports unplaced work instead of soaking it up
- [x] Tickets larger than capacity reported as too large
- [x] `over` and `tooBig` reported in the proposal with an explanation
- [x] Board shows units against capacity, with FULL and over-by-N

## Project filter

- [x] Input filters the fixed project list rather than creating entries
- [x] Clicking a match attaches it; clicking a chip removes it
- [x] Enter attaches the top match; Escape clears the query
- [x] Empty state says the list is fixed

## Verification

- [x] Load measured in units, not tickets (`two tickets, five units`)
- [x] A three-unit ticket is not squeezed into two units of room
- [x] A ticket too large for any release is reported, with a reason
- [x] Every release stays within capacity when a proposal is applied
- [x] 84 tests pass, typecheck and build clean

## Not done

- The triage decision meter still counts decisions, not work units — the accept
  record does not carry the ticket's estimate. Deliberately left rather than
  converted by guesswork.
- No per-release capacity override (a short release, a holiday sprint).
- No percentage "nearly full" threshold: the room count is the indicator, and a
  cutoff would be an invented policy.
