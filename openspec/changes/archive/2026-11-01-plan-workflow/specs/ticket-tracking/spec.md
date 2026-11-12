## ADDED Requirements

### Requirement: One planning workflow

The application SHALL offer one Plan page with three steps, in order: Fill out,
Schedule and Check. Each step SHALL be a queue that empties as its work is done.
The Plan page SHALL replace the separate triage, review and release-board
screens. The header SHALL count what each step holds.

#### Scenario: Five tabs

- WHEN the application is opened
- THEN the tabs are Plan, Projects, Register, Decisions and History
- AND Plan opens on the Fill out step

#### Scenario: The header counts the pipeline

- WHEN the application is open on any tab
- THEN the header states how many tickets are to fill out, to schedule and to
  check, and how many would still benefit from more detail

#### Scenario: Stepping changes nothing

- WHEN a ticket is stepped past in Fill out or Check
- THEN nothing about it is modified
- AND only an explicit key or button writes

#### Scenario: Shortcuts do not collide

- WHEN the Plan page is open
- THEN j and k step through the current queue in every step
- AND the decision keys (decline, defer, block, take on) work only in Fill out

### Requirement: Fill out

The Fill out step SHALL hold every open ticket that is not ready to schedule,
and every deferred or blocked ticket whose revisit day has come, ahead of the
rest. Each ticket's missing required fields SHALL be editable on its card.
Completing them SHALL accept the ticket and move it to Schedule.

#### Scenario: Editing in place

- WHEN a ticket in Fill out is missing its estimate
- THEN the estimate can be entered on the card itself
- AND once every required field is set the ticket leaves Fill out for Schedule
- AND an accept is recorded in the decision log

#### Scenario: Deciding not to schedule

- WHEN a ticket in Fill out is declined, deferred or blocked
- THEN the decision is recorded with its reason
- AND a deferral or a block is given a weekly revisit day

#### Scenario: Returned work leads

- WHEN deferred or blocked work has come back on its revisit day
- THEN it is shown ahead of tickets that are merely incomplete
- AND it can be taken on, deferred again, declined or blocked again

#### Scenario: Undoing a decision

- WHEN a decision made in Fill out needs undoing
- THEN it is reverted from History, like any other change
- AND there is no separate undo key

### Requirement: Ready to schedule

A ticket SHALL be ready to schedule when it has a priority, a type, an estimate,
and either a due date or an explicit choice of no hard date. Project, summary
and stakeholders SHALL NOT hold a ticket back. They SHALL be shown as details
that would still help, each with the consequence of leaving it out.

#### Scenario: The gate

- WHEN a ticket has priority, type and estimate, and no hard date is chosen
- THEN it is ready to schedule

#### Scenario: Nudges are not gates

- WHEN a ready ticket has no project, no summary or no stakeholder
- THEN it is still ready
- AND the missing detail is listed as one that would still help, with why

### Requirement: Blank until chosen

Estimate, priority, type and due date SHALL start unset on a new ticket. "No hard
date" SHALL be something a person chooses, distinct from a due date not yet
answered. A default SHALL NOT stand in for a decision.

#### Scenario: A new ticket

- WHEN a ticket is created with only a name
- THEN its estimate, priority, type and due date are unset
- AND it is not ready to schedule

#### Scenario: Choosing no hard date

- WHEN no hard date is chosen for a ticket
- THEN its due date counts as answered
- AND setting a date afterwards replaces that choice

### Requirement: Work spans releases

A ticket SHALL store the release it ships in. It SHALL occupy as many releases as
its estimate, ending at that one, counted in ship-date order with undated
releases after dated ones. It SHALL cost one unit of capacity in each release it
spans.

#### Scenario: A two-sprint ticket

- WHEN a ticket estimated at two sprints ships in v0.24
- THEN it occupies v0.23 and v0.24
- AND it costs one unit in each

#### Scenario: Shown in every column it spans

- WHEN the release board is shown
- THEN the full card appears in the release the ticket ships in
- AND each earlier release it spans shows a slim row naming where it continues

#### Scenario: The estimate grows

- WHEN a scheduled ticket's estimate is increased
- THEN the release it ships in is unchanged
- AND it spans further back

### Requirement: Release close-out

Once a release has shipped, every open ticket that ships in it SHALL come up in
the Check step with no choice pre-selected. Each SHALL need an explicit choice:
done, carry over to the next release, or back to the backlog. Applying the
choices SHALL be one revertible action. Tickets left undecided SHALL stay in
Check.

#### Scenario: Nothing is pre-selected

- WHEN a release ships with open tickets in it
- THEN each ticket is listed in Check with no choice selected

#### Scenario: Applying choices

- WHEN some tickets are marked done and others carried over, and the choices are
  applied
- THEN done tickets close with today's date
- AND carried-over tickets ship in the next release, with their carry-over count
  increased by one
- AND tickets left undecided stay in Check
- AND the whole batch is one revertible action

#### Scenario: Only the ship release asks

- WHEN a release a ticket merely continues through has shipped
- THEN that ticket is not asked about

#### Scenario: Nowhere to carry over to

- WHEN a shipped release has no later release to carry over into
- THEN carrying over is not offered, and the reason is stated

### Requirement: The current release is derived

The current release SHALL be the earliest release, in ship-date order, that has
neither shipped nor frozen. It SHALL NOT be stored. A ticket SHALL be shown as
being worked on when the releases it spans have started.

#### Scenario: A release ships

- WHEN the current release's ship date arrives
- THEN the next release that has neither shipped nor frozen becomes current
- AND nothing has to be updated by hand

### Requirement: Starting too late is reported, not blocked

A ticket placed where it would have had to start in a release that had already
shipped SHALL be allowed, and SHALL be reported in Check as starting too late.
Auto-optimize SHALL never propose such a placement.

#### Scenario: Placed by hand

- WHEN a three-sprint ticket is dragged into the current release
- THEN it is placed there
- AND Check reports it as starting too late

#### Scenario: Progress is not lateness

- WHEN a ticket was placed in time and an earlier release it spans has since
  shipped
- THEN it is not reported as starting too late

### Requirement: Check

The Check step SHALL list, for each release in ship-date order, what is going
wrong: tickets that ship after their due date, are past due, start too late,
arrived after freeze or carry a contradiction flag, and a release over capacity.
Every item SHALL state why it matters.

#### Scenario: Every alert explains itself

- WHEN Check raises an item
- THEN it states the consequence of the problem in words
- AND a problem that cannot state a consequence is not raised

#### Scenario: Ships after its due date

- WHEN a ticket's ship release ships after its due date
- THEN Check reports that it will not make its date

#### Scenario: Closed tickets are out of scope

- WHEN Check is shown
- THEN closed tickets raise nothing

## MODIFIED Requirements

### Requirement: Ticket field tiers

Every ticket field SHALL belong to exactly one of three tiers: **core** (name,
summary, projects, externalUrl, dueDate, noHardDate, estimate, priority, type),
**optional** (stakeholders, notes) or **background metadata** (state, opened,
sprint, planned, carryovers, lastTouched, closed). The tiers SHALL NOT overlap.

#### Scenario: Core is asked for

- WHEN a ticket is created
- THEN name, summary, projects, external link, due date or no hard date,
  estimated completion, priority and type are requested
- AND the ticket can be saved with only a name filled in

#### Scenario: Optional is available but never required

- WHEN the ticket editor is open
- THEN stakeholders and notes are present in a collapsed group
- AND saving is possible without touching them

#### Scenario: Background metadata is not hand-entered

- WHEN the ticket editor is open
- THEN state, opened, release, lastTouched, closed and carryovers are shown
  read-only
- AND no action is offered there; carry-overs are recorded by release close-out

#### Scenario: No field outside the tiers

- WHEN the stored ticket fields are inspected
- THEN they are exactly the core, optional and background fields
- AND owner, owner type, size and next-action are absent

### Requirement: Estimated completion length

A ticket SHALL carry an estimate of how many sprints it expects to take, as a
whole number of one or more, or no estimate yet. A scheduled ticket whose ship
release ships after its due date SHALL be reported as not fitting.

#### Scenario: Estimate is expressed in sprints

- WHEN an estimate is chosen
- THEN it is a whole number of sprints, one or more
- AND it may be left unset until someone decides it

#### Scenario: Will not fit before the due date

- WHEN a scheduled ticket's ship release ships after its due date
- THEN the ticket is reported as not fitting before its due date

### Requirement: Release capacity is measured in work

A release's load SHALL be one unit for each open ticket whose span includes it,
and capacity SHALL be expressed in the same unit. A release SHALL be reported as
full when its load reaches capacity, and as over when it exceeds it. Capacity
SHALL NOT be measured by counting decisions.

#### Scenario: Load is work, not head count

- WHEN a release is spanned by more open tickets than its capacity
- THEN it is reported over capacity
- AND a ticket spanning several releases counts once in each of them

#### Scenario: Full and over are distinct

- WHEN a release's load equals its capacity
- THEN it is reported full
- WHEN a release's load exceeds its capacity
- THEN it is reported over, by the amount it exceeds it

#### Scenario: The board shows room

- WHEN the release board is shown
- THEN each release shows its load in units against its capacity
- AND a release with room shows how much room is left

#### Scenario: Exceeding capacity is reported, not blocked

- WHEN work is assigned to a release that is already full
- THEN the assignment is made
- AND the release is shown as over capacity

### Requirement: Auto-optimize proposes, never imposes

Auto-optimize SHALL produce a proposal for assigning releases, SHALL show the
proposal before anything changes, and SHALL apply it only on explicit
confirmation. It SHALL place only tickets that are ready to schedule, SHALL NOT
move a ticket that already has a release, SHALL NOT propose work that would take
any release it spans over capacity, SHALL NOT propose a span that includes a
release that has shipped, and SHALL order dated work before undated work.

#### Scenario: Preview before applying

- WHEN auto-optimize is requested
- THEN the proposed moves are shown with a reason for each
- AND no ticket has changed release yet

#### Scenario: Apply

- WHEN the proposal is applied
- THEN every proposed ticket is assigned to its proposed release and committed
- AND the whole batch is one revertible action

#### Scenario: Discard

- WHEN the proposal is discarded
- THEN no ticket has changed release

#### Scenario: Manual arrangements survive

- WHEN a ticket is already assigned to a release
- THEN auto-optimize does not move it

#### Scenario: The whole estimate has to fit

- WHEN a ticket's span would take any release it covers over capacity
- THEN the ticket is not proposed to ship there
- AND it is proposed for the earliest release whose whole span has room

#### Scenario: Nothing is soaked up silently

- WHEN no eligible release can absorb a ticket
- THEN it is left unplaced
- AND the count of unplaced tickets is stated

#### Scenario: Work too large for any release

- WHEN a ticket's estimate is longer than the run of unshipped releases
- THEN it is reported as too large to place
- AND it is not silently dropped from the report

#### Scenario: Only ready work is placed

- WHEN a ticket is not ready to schedule
- THEN auto-optimize does not propose it

### Requirement: Weekly revisits

Deferred and blocked work SHALL be given a revisit date in whole weeks, and every
revisit date SHALL fall on the same day of the week, so that it returns in one
batch. The revisit day SHALL be defined in one place. A deferred or blocked
ticket whose revisit day has arrived SHALL return to Fill out ahead of
incomplete work, and SHALL be shown as having come back.

#### Scenario: Weeks, not days

- WHEN a deferral or a block is recorded
- THEN the revisit is chosen in whole weeks
- AND an arbitrary single date cannot be chosen

#### Scenario: Every revisit lands on the same day

- WHEN a revisit date is produced from any day of the week
- THEN it falls on the revisit day
- AND deferring on the revisit day itself is a full week out, not the same day

#### Scenario: Deferred work returns

- WHEN a deferred or blocked ticket's revisit day has arrived
- THEN it appears in Fill out ahead of incomplete work
- AND it is labelled as having come back, with its block reason if it was blocked

#### Scenario: Returning is not automatic

- WHEN a deferred or blocked ticket's revisit day has not yet arrived
- THEN it does not appear in Fill out

#### Scenario: Deciding again clears it

- WHEN a ticket that came back is taken on, declined, or deferred again
- THEN it stops returning
- AND deferring again moves the revisit to the later date

### Requirement: Updating people without a backend

The system SHALL produce a decision summary and a per-project summary, and SHALL
allow the register to be exported as CSV and JSON.

#### Scenario: Summary export

- WHEN decisions have been recorded
- THEN a markdown summary groups them by accepted, deferred, declined, blocked,
  done and carried over
- AND every deferral and every block carries its reason and revisit date

### Requirement: Version sprints

Releases SHALL be named as version strings and SHALL each carry a freeze date and
a release date. Version strings SHALL be compared numerically, not as text. The
stored order of releases SHALL govern their display order, SHALL default to newest
release first, and SHALL be changeable by the owner.

#### Scenario: Numeric ordering

- WHEN the release names `v0.9`, `v0.21` and `v0.22` are compared
- THEN `v0.9` sorts before `v0.21`, and `v0.21` before `v0.22`

#### Scenario: Default display order

- WHEN the board is shown for the first time
- THEN the columns read ready to schedule, `v0.25`, `v0.24`, `v0.23`, `v0.22`,
  `v0.21`
- AND the newest release is leftmost

#### Scenario: Reordering a sprint

- WHEN a release is moved one place left
- THEN it swaps with its left neighbour
- AND the new order persists across a reload

#### Scenario: Order boundaries

- WHEN the leftmost release is moved left, or the rightmost is moved right
- THEN the order is unchanged

#### Scenario: Adding a sprint

- WHEN a release newer than every existing one is added
- THEN it is placed leftmost
- AND WHEN a release older than every existing one is added, it is placed rightmost
- AND the relative order of the existing releases is left alone

#### Scenario: One column per sprint

- WHEN the board is shown
- THEN there is a ready-to-schedule column plus one column per release
- AND a ticket's card appears in the column of the release it ships in

#### Scenario: Unscheduling on sprint removal

- WHEN a release column is removed
- THEN its tickets become unscheduled
- AND they are not deleted

#### Scenario: Authoring dates

- WHEN a release's name is clicked on the board
- THEN its freeze and release dates can be viewed and changed

### Requirement: Release assignment by dragging

A ticket SHALL be assignable to a release by dragging it between board columns.
Dragging a ticket back to the ready-to-schedule column SHALL unassign it. The same
change SHALL be possible without a pointer. Any ticket MAY be placed by hand,
ready or not.

#### Scenario: Dragging into a release

- WHEN a ticket is dragged onto a release column
- THEN it ships in that release and leaves the ready-to-schedule column

#### Scenario: Dragging back to the backlog

- WHEN a scheduled ticket is dragged onto the ready-to-schedule column
- THEN it is unassigned and leaves that release

#### Scenario: Keyboard path

- WHEN a ticket's release cannot be changed by dragging
- THEN it can be changed with the per-ticket release selector

### Requirement: The decision log is append-only

A decision SHALL remain in the decision log once it is recorded. Deleting a
ticket SHALL NOT remove its decisions. Resetting to the demo data SHALL NOT
remove decisions either, and SHALL give the demo tickets ids that no existing
ticket or decision uses. Resetting SHALL be recorded in the history like any
other change, so that it can be reverted.

#### Scenario: A deleted deferral comes back

- WHEN a deferred ticket is deleted and the deletion is reverted
- THEN its revisit date is still known
- AND it returns to Fill out on that day

#### Scenario: Reset can be undone

- WHEN the register is reset to the demo data
- THEN the reset appears in the history
- AND reverting it restores the tickets and settings from before it
- AND no demo ticket reuses an existing ticket's id

#### Scenario: Reset is out of the way

- WHEN the application is open on any tab
- THEN the header offers no reset
- AND reset is offered on the History tab, saying that it can be reverted

## REMOVED Requirements

### Requirement: Review sweep

**Reason**: Its two kinds of alert were always two stages of one pipeline. Missing
data is now the Fill out step, and work going wrong is the Check step, so the
separate screen goes and nothing it showed is lost.

**Migration**: Use Plan → Fill out for missing data and Plan → Check for risks. The
read-only stepping, worst-first order and explained alerts carry over in "One
planning workflow" and "Check".
