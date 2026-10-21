# Tasks

## Audit

- [x] `auditTicket` — gaps and risks, each with a stated consequence
- [x] Gaps: no summary, no project, no stakeholder, committed with no due date
- [x] Risks: past due, left behind in a shipped release, will not fit, plus the
      existing contradiction flags with explanations
- [x] `audit` — open by default, closed by opt-in, worst first
- [x] Summary counts: tickets, with alerts, total, gaps, risks

## Screen

- [x] One ticket at a time, with its alerts and the reason for each
- [x] Step forward and back; jump to the next flagged ticket
- [x] Keyboard: j / k step, f next flagged, enter to edit
- [x] Progress reported as a position out of the total
- [x] Read-only — edit is an explicit action that opens the existing editor

## Verification

- [x] Every gap raised for a ticket with nothing filled in
- [x] No gap raised for a well-formed ticket
- [x] Committed-with-no-date, shipped-release and past-due all caught
- [x] A closed ticket raises nothing, since it cannot slip
- [x] Ordering is worst-first, and the counts add up
- [x] 94 tests pass, typecheck and build clean

## Not done

- No inline fixing from the sweep; it opens the editor instead
- No "no external link" or blanket "no due date" alert — neither can state a
  consequence for most tickets, so both would be noise
- No sweep of closed tickets by default
