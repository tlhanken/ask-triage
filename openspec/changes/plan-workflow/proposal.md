# One planning workflow: fill out, schedule, check

## Why

The app can decide about work and schedule it, but it cannot finish anything:

- No code path ever sets "In Progress" or "Done". The only way a ticket closes
  is Decline.
- "Blocked" is a dead end. It is not in any queue, and the editor shows state
  read-only.
- `currentSprint` is a stored "v0.23" that nothing updates. Accept keeps putting
  work into it after it ships, and Review then flags that work as left behind.
- The triage capacity meter counts every Accept ever made, in tickets, under a
  label that says "this sprint". Capacity everywhere else is measured in work
  units.

The screens also duplicate each other:

- Triage and Review are the same machine: step through a queue of tickets, one
  card at a time. They differ only in which tickets they show and what you can
  do to each.
- Their shortcuts collide: `f` is defer in one and "next flagged" in the other.
- The triage loop, the app's main screen, has no requirement in the spec.

What the user actually does is a pipeline: get every ticket filled out, assign
it to sprints, and check the plan.

## What Changes

- **One Plan page with three steps.** Each step is a queue that empties. The
  page replaces Triage, Review and Sprints, so 7 tabs become 5: Plan, Projects,
  Register, Decisions, History.
  1. **Fill out.** Open tickets missing anything required, plus deferred and
     blocked work whose revisit day has come. Missing fields are edited on the
     card itself. Decline, defer and block live here too.
  2. **Schedule.** The release board. Ready but unassigned tickets sit on the
     left, by priority. Auto-optimize places only ready tickets. Dragging by
     hand can place any ticket anywhere.
  3. **Check.** For each release, what is going wrong: won't fit, past due,
     over capacity, scope after freeze, starts too late. Release close-out also
     happens here.
- **Ready to schedule** means enough for auto-optimize to place the ticket:
  priority, type, estimate, and a due date or an explicit "no hard date". The
  header counts the pipeline: "4 to fill out · 6 to schedule · 3 to check".
- **Nudges, not gates.** Project, summary and stakeholders do not hold a ticket
  back. They are shown as "would still help", with the consequence of leaving
  them out, and counted in the header.
- **Fields start blank unless chosen.** The estimate, priority, type and due
  date start unset. "No hard date" is something you choose. A default never
  stands in for a decision.
- **The estimate is a whole number of sprints**, 1 or more.
- **Work spans releases.** A ticket stores the release it **ships in**. It
  occupies the estimate's number of releases ending there, counted in ship-date
  order, and costs 1 unit in each. The board shows it in every column it spans:
  the full card where it ships, and a slim "continuing → v0.25" row before
  that.
- **Release close-out.** When a release ships, the open tickets due in it come
  up in Check with **nothing pre-selected**. Each needs an explicit choice:
  Done, carry over to the next release, or back to the backlog. Tickets left
  undecided stay in Check. Only the release a ticket ships in asks; releases it
  merely continues through ask nothing.
- **Current release is derived**: the earliest release that has not shipped and
  is not frozen, the same rule auto-optimize uses. The stored `currentSprint`
  goes away.
- **"In Progress" is dropped as a state.** Nothing sets it. "Being worked on"
  is derived instead: the ticket's span has started.
- **Blocked comes back** on the weekly revisit, like Defer, with its block reason
  shown.
- **Starting too late is reported, not blocked.** A ticket you place by hand
  where it would have had to start in an already-shipped release is allowed,
  and Check flags it "starts too late". Auto-optimize never proposes that.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking`: adds requirements for the planning workflow, readiness,
  spans, close-out, the derived current release and returning blocked work.
  The Review sweep becomes the Fill out and Check steps. Estimate,
  capacity and auto-optimize change as described. Spec deltas will be written
  once this design is agreed.

## Impact

Code: a new `Plan.tsx` that absorbs `Triage.tsx`, `Review.tsx` and
`Sprints.tsx`. In `schema.ts`: `isReady`, span helpers, a derived current
release, the estimate type, and the audit split into gap and risk. In
`store.ts`: `optimizePlan` working over spans, close-out, and the Blocked
revisit. Plus the migration, and tests.

Data: a migration. `estimate` becomes a number or null (existing values are
kept, since they are numbers already). `"In Progress"` maps to "Committed".
`settings.currentSprint` is dropped. The live register still looks like the seed
data, so the migration is cheap now.

Out of scope: per-team capacity (the type is required so this can be added
later), a settings editor, measured throughput, and stakeholder digests.
