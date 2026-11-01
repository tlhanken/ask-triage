## 1. Model

- [ ] 1.1 Estimate: a whole number of sprints or null; priority: a choice or null;
      `noHardDate` beside `dueDate`; `planned` background date
- [ ] 1.2 States: drop In Progress and Accepted-Backlog
- [ ] 1.3 Drop `settings.currentSprint` and the decision log's `prev`
- [ ] 1.4 `isReady`, the nudges, and the derived current release
- [ ] 1.5 Release order (ship-date order, undated after) and spans
- [ ] 1.6 Load in span units; "ships after due", "starts too late", "being worked on"
- [ ] 1.7 Bump the stored version to 5; seed tickets start with no estimate

## 2. Store

- [ ] 2.1 Fill out queue: returned work first, then incomplete open tickets
- [ ] 2.2 Completing the required fields records Accept; "take on" for returned work
- [ ] 2.3 Defer and Block take a revisit week and clear the release
- [ ] 2.4 Blocked returns on its revisit day, with its reason
- [ ] 2.5 Schedule queue: ready, open, unscheduled, by priority
- [ ] 2.6 `optimizePlan` over spans, ready tickets only
- [ ] 2.7 Close-out: shipped releases' open tickets; done, carry over, backlog,
      applied as one action; undecided stay
- [ ] 2.8 Check: per-release risks with reasons
- [ ] 2.9 Remove undo-last-decision

## 3. Interface

- [ ] 3.1 Plan page with Fill out, Schedule and Check; five tabs
- [ ] 3.2 Header counts the pipeline and the nudges
- [ ] 3.3 Fill out card: inline required fields, nudges, decisions, j/k, ]
- [ ] 3.4 Schedule: board with the ready column, spans as continuing rows
- [ ] 3.5 Check: risks per release, close-out with nothing pre-selected
- [ ] 3.6 Ticket editor: number estimate, blank selects, no-hard-date choice,
      no carry-over button
- [ ] 3.7 Register, Projects, Decisions and exports follow the new fields

## 4. Verification

- [ ] 4.1 Unit tests for readiness, spans, load, close-out, auto-optimize,
      starts-too-late and the queues
- [ ] 4.2 Interface tests for the three steps
- [ ] 4.3 typecheck, lint, test, build, `openspec validate plan-workflow --strict`
- [ ] 4.4 README: screens, conventions, and the "Not done yet" entry
- [ ] 4.5 Archive into `ticket-tracking`
