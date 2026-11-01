## 1. Model

- [x] 1.1 Estimate: a whole number of sprints or null; priority: a choice or null;
      `noHardDate` beside `dueDate`; `planned` background date
- [x] 1.2 States: drop In Progress and Accepted-Backlog
- [x] 1.3 Drop `settings.currentSprint` and the decision log's `prev`
- [x] 1.4 `isReady`, the nudges, and the derived current release
- [x] 1.5 Release order (ship-date order, undated after) and spans
- [x] 1.6 Load in span units; "ships after due", "starts too late", "being worked on"
- [x] 1.7 Bump the stored version to 5; seed tickets start with no estimate

## 2. Store

- [x] 2.1 Fill out queue: returned work first, then incomplete open tickets
- [x] 2.2 Completing the required fields records Accept; "take on" for returned work
- [x] 2.3 Defer and Block take a revisit week and clear the release
- [x] 2.4 Blocked returns on its revisit day, with its reason
- [x] 2.5 Schedule queue: ready, open, unscheduled, by priority
- [x] 2.6 `optimizePlan` over spans, ready tickets only
- [x] 2.7 Close-out: shipped releases' open tickets; done, carry over, backlog,
      applied as one action; undecided stay
- [x] 2.8 Check: per-release risks with reasons
- [x] 2.9 Remove undo-last-decision

## 3. Interface

- [x] 3.1 Plan page with Fill out, Schedule and Check; five tabs
- [x] 3.2 Header counts the pipeline and the nudges
- [x] 3.3 Fill out card: inline required fields, nudges, decisions, j/k, ]
- [x] 3.4 Schedule: board with the ready column, spans as continuing rows
- [x] 3.5 Check: risks per release, close-out with nothing pre-selected
- [x] 3.6 Ticket editor: number estimate, blank selects, no-hard-date choice,
      no carry-over button
- [x] 3.7 Register, Projects, Decisions and exports follow the new fields

## 4. Verification

- [x] 4.1 Unit tests for readiness, spans, load, close-out, auto-optimize,
      starts-too-late and the queues
- [x] 4.2 Interface tests for the three steps
- [x] 4.3 typecheck, lint, test, build, `openspec validate plan-workflow --strict`
- [x] 4.4 README: screens, conventions, and the "Not done yet" entry
- [x] 4.5 Archive into `ticket-tracking`
