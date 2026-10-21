# Review sweep — data missing, and work going quietly wrong

## Why

Triage shows only the UNDECIDED few, which is what makes it fast to decide. That
leaves a gap with no home: nothing walks the rest of the register. A committed
ticket with no due date cannot be late, so nothing ever notices it. Work left
sitting in a release that shipped three weeks ago is invisible unless you happen
to look at that column. A ticket with no project appears in no project update and
nobody but the owner ever sees it.

The contradiction flags existed, but only on a ticket-by-ticket basis — there was
no pass whose JOB was to look at everything.

## What Changes

- New **Review** screen: steps through every ticket in scope, one at a time, and
  raises alerts for what is missing and what is going wrong.
- Two alert families. **Gaps**: no summary, no project, no stakeholder, or
  committed with no due date. **Risks**: past due, left behind in a shipped
  release, cannot finish before its due date, or carrying a contradiction flag.
- Every alert states WHY it matters. A flag with no stated consequence is noise.
- Worst first, with a jump to the next flagged ticket, so fixing from the top
  shortens the list rather than shuffling it.
- Open tickets by default, with closed ones an explicit opt-in.
- The sweep is **read-only**: it steps and reports, and editing stays a separate
  explicit action.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — a new requirement defines the review sweep and the two
  families of alert.

## Impact

Code: `schema.ts` (`auditTicket`, `audit`, `Alert`), `Review.tsx` (new),
`App.tsx` (new tab), `styles.css`, tests.

Data: none. The sweep computes and reports; it stores nothing and mutates nothing.

Note on the seed: the gaps family raises nothing against it because the seed is
well-formed, and past-due / left-behind raise nothing because nothing is
scheduled yet. Both light up on real entries as they accumulate.
