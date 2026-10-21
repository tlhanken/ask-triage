# Auto-optimize explains itself, and survives missing release dates

## Why

Clicking Auto-optimize could produce a silent empty proposal with no indication
of why. Four different states all rendered as "nothing", and the empty-state text
listed four possibilities without saying which one applied.

One of those states was also a real defect rather than a correct-but-quiet
answer: a release with no release date was excluded from reasoning entirely, so a
save whose releases predate release dates made auto-optimize completely inert.
The user's own save was in exactly this state.

## What Changes

- Auto-optimize now returns a proposal **with the reasoning that produced it**:
  which releases were eligible, which were skipped and why, which have no date,
  which are at capacity, how many tickets were considered, and how many went
  unplaced.
- A release with no release date is **no longer excluded**. It is considered
  after every dated release, and a ticket with a due date placed into it is
  flagged as having no release date. Missing metadata stops being a reason to
  refuse to act.
- An empty or limited proposal now **states its reason in plain language**,
  derived from the result rather than hardcoded in the interface.
- New action: **give releases with no dates a two-week cadence**, oldest version
  first. Explicit, revertible, and never applied on its own.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — release-date reasoning now covers releases without dates
  and requires a stated reason whenever nothing is proposed. A new requirement
  covers repairing missing release dates.

## Impact

Code: `store.ts` (`OptimizeResult`, `optimizePlan`, `explainPlan`,
`fillReleaseDates`), `Sprints.tsx`, `App.tsx`, tests.

Data: one new revertible action; no migration.

Behaviour change worth knowing: tickets can now be proposed into releases that
have no release date. They are never preferred over a dated release, and the
proposal says so.
