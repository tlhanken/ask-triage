# ticket-tracking Specification

## Purpose
TBD - created by archiving change revel-01-trim-ticket-fields. Update Purpose after archive.

## Requirements

### Requirement: Field discipline

The ticket model SHALL store only fields that belong to one of the three tiers.
A field that merely restates other data SHALL NOT be stored. The editor SHALL ask
for core fields, present optional fields without requiring them, and SHALL NOT
ask for background metadata.

#### Scenario: The stored field set

- WHEN the ticket model is inspected
- THEN it carries the core fields, the optional fields and the background metadata
- AND nothing else

#### Scenario: Rejecting a derivable field

- WHEN a field can be derived from data already stored
- THEN it is not stored, and the value is derived on read
- AND an example is the external ticket key, which is derived from the external
  ticket link

#### Scenario: The editor asks only what a person decides

- WHEN a ticket is created or edited
- THEN the editor requests the core fields
- AND optional fields sit in a collapsed group
- AND background metadata is read-only

### Requirement: External ticket link

A ticket MAY reference an external ticket. The link SHALL be stored; a display
label SHALL be derived from it.

#### Scenario: Label derived from link

- WHEN a ticket has the external link `https://partnerco.atlassian.net/browse/PX-118`
- THEN the interface displays `PX-118`
- AND no separate key field is stored

#### Scenario: No external ticket

- WHEN a ticket has no external link
- THEN the derived label is empty

### Requirement: Relevant projects

A ticket SHALL belong to zero or more projects drawn from a controlled list. The
list SHALL be defined in one place and drive every project display. Choosing a
project SHALL narrow the controlled list by a typed filter and offer the result as
a bounded suggestion list; projects SHALL NOT be created by typing.

#### Scenario: Multiple projects

- WHEN a ticket is assigned to Atlas and Platform
- THEN it appears in the project view for both
- AND it appears in neither for any project it is not assigned to

#### Scenario: Project view is trustworthy

- WHEN the project view lists a project's tickets
- THEN every ticket shown is assigned to that project
- AND no ticket is shown that is not assigned to it

#### Scenario: Filtering the list

- WHEN part of a project name is typed
- THEN only projects whose names match are offered
- AND projects already attached are not offered again

#### Scenario: Bounded suggestions

- WHEN more projects match than the suggestion cap allows
- THEN only the cap's worth are offered
- AND the number that matched in total is stated
- AND the offers scroll rather than growing without limit

#### Scenario: The obvious match comes first

- WHEN a typed query matches one project at its start and another inside it
- THEN the project beginning with the query is offered first

#### Scenario: Attaching and detaching

- WHEN an offered project is picked
- THEN it is attached to the ticket
- AND it is shown as a chip, and no longer offered
- AND clicking an attached project's chip removes it

#### Scenario: Choosing with the keyboard

- WHEN the suggestion list is open
- THEN the arrow keys move the highlighted offer
- AND enter picks it
- AND nothing is highlighted before a key is pressed

#### Scenario: The list stays controlled

- WHEN the typed text matches no project
- THEN no project is offered and no project is created
- AND the editor says the list is fixed

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
- THEN the columns read backlog, `v0.25`, `v0.24`, `v0.23`, `v0.22`, `v0.21`
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
- THEN there is a backlog column plus one column per release
- AND a ticket appears in the column of the release it is assigned to

#### Scenario: Unscheduling on sprint removal

- WHEN a release column is removed
- THEN its tickets become unscheduled
- AND they are not deleted

#### Scenario: Authoring dates

- WHEN a release's name is clicked on the board
- THEN its freeze and release dates can be viewed and changed

### Requirement: Priority flags surface contradictions

The system SHALL derive flags from stored data without manual entry.

#### Scenario: Slippage

- WHEN an open ticket's carryover count reaches the slippage threshold
- THEN it is flagged SLIPPED

#### Scenario: Date risk

- WHEN an open ticket's due date falls within the risk horizon
- THEN it is flagged DATE-RISK

#### Scenario: Critical with no sprint

- WHEN a ticket is marked Critical and is assigned to no sprint
- THEN it is flagged UNPLANNED

### Requirement: Local-first persistence

Ticket data SHALL be stored on the user's machine and SHALL NOT require a
database or a network service. When a development or preview server is present,
the register SHALL additionally be written to a JSON file inside the repository so
that it can be version-controlled by git. When no such server is present, the
application SHALL offer a file-based alternative and a download. A save produced
by an incompatible earlier model SHALL NOT be loaded partially.

#### Scenario: Both layers

- WHEN the application is served by the development or preview server
- THEN changes are written to `data/register.json` as well as to browser storage

#### Scenario: No server

- WHEN the application is opened from a static build
- THEN it still works, and the file path degrades to a file picker or a download

#### Scenario: Incompatible save

- WHEN the stored data does not match the current model
- THEN the application starts from the seed data instead of loading it

#### Scenario: Adopting a newer file

- WHEN the browser holds no state of its own and a register file exists
- THEN the file is loaded
- AND a browser that already holds state is not overwritten by the file

### Requirement: Updating people without a backend

The system SHALL produce a decision summary and a per-project summary, and SHALL
allow the register to be exported as CSV and JSON.

#### Scenario: Summary export

- WHEN decisions have been recorded
- THEN a markdown summary groups them by accepted, deferred, declined and blocked
- AND every deferral carries its reason and revisit date

### Requirement: Release assignment by dragging

A ticket SHALL be assignable to a release by dragging it between board columns.
Dragging a ticket back to the backlog SHALL unassign it. The same change SHALL be
possible without a pointer.

#### Scenario: Dragging into a release

- WHEN a backlog ticket is dragged onto a release column
- THEN it is assigned to that release and leaves the backlog

#### Scenario: Dragging back to the backlog

- WHEN a scheduled ticket is dragged onto the backlog column
- THEN it is unassigned and leaves that release

#### Scenario: Keyboard path

- WHEN a ticket's release cannot be changed by dragging
- THEN it can be changed with the per-ticket release selector

### Requirement: Auto-optimize proposes, never imposes

Auto-optimize SHALL produce a proposal for assigning releases, SHALL show the
proposal before anything changes, and SHALL apply it only on explicit
confirmation. It SHALL NOT move a ticket that already has a release, SHALL NOT
propose work that would take a release over capacity, SHALL NOT propose a release
that has already shipped, and SHALL order dated work before undated work.

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

- WHEN a ticket's estimate does not fit the room left in a release
- THEN that release does not receive the ticket
- AND the ticket is proposed for a release that can absorb its whole estimate

#### Scenario: Nothing is soaked up silently

- WHEN no eligible release can absorb a ticket
- THEN it is left unplaced
- AND the count of unplaced tickets is stated

#### Scenario: Work too large for any release

- WHEN a ticket's estimate exceeds the capacity of every release
- THEN it is reported as too large to place
- AND it is not silently dropped from the report

### Requirement: Version history and revert

Every change SHALL record the state it is about to replace, under a human-readable
label. The history SHALL be viewable and SHALL allow restoring the state from
before any recorded change. A revert SHALL itself be recorded so that it can be
undone. History SHALL NOT rewrite the decision log.

#### Scenario: Recording

- WHEN a change is made
- THEN a labelled entry appears in the history
- AND a change that alters nothing records no entry

#### Scenario: Reverting

- WHEN a history entry is reverted to
- THEN tickets and settings are restored to the state before that change
- AND the revert itself appears in the history

#### Scenario: Bounded growth

- WHEN more changes are made than the history cap
- THEN the oldest entries are dropped and the most recent ones are kept

#### Scenario: Deletion is recoverable

- WHEN a ticket is deleted and the deletion is reverted
- THEN the ticket is restored
- AND its id is not reused by any later ticket

### Requirement: Feature freeze and scope after freeze

Every release SHALL carry a feature freeze date and a release date. A release
SHALL be considered frozen once its freeze date has arrived. Adding work to a
frozen release SHALL be permitted and SHALL be reported as scope after freeze.

#### Scenario: Dates on the board

- WHEN the board is shown
- THEN each release displays its freeze date and its release date

#### Scenario: Freezing

- WHEN a release's freeze date is today or in the past
- THEN the release is shown as frozen
- AND a freeze date later than the release date is rejected

#### Scenario: Work arriving after freeze

- WHEN a ticket is assigned to a frozen release
- THEN it is assigned
- AND a notice names the freeze date and how long ago it was
- AND the release column counts what arrived after freeze

#### Scenario: Nothing slips unnoticed

- WHEN a release has not frozen
- THEN it reports no scope after freeze

### Requirement: Release dates drive automatic placement

Auto-optimize SHALL reason from release dates: it SHALL NOT propose a release
that has already shipped, SHALL NOT propose a frozen release, SHALL fill releases
in release-date order, and SHALL prefer the earliest release that ships on or
before the ticket's due date. When no release ships in time it SHALL say so. A
release with no release date SHALL remain usable, SHALL be considered after every
dated release, and SHALL mark any dated ticket placed into it as uncertain.
Auto-optimize SHALL state the reason whenever it proposes nothing, and SHALL
state what limited it whenever it places fewer tickets than it considered.

#### Scenario: Shipped and frozen releases are skipped

- WHEN a release has shipped, or has frozen
- THEN auto-optimize proposes no work into it

#### Scenario: Choosing by date

- WHEN a ticket has a due date
- THEN auto-optimize prefers the earliest release shipping on or before it

#### Scenario: No release ships in time

- WHEN no eligible release ships before a ticket's due date
- THEN the proposal still places it in the earliest release with room
- AND the move is marked as a conflict

#### Scenario: A release with no date is still usable

- WHEN a release has no release date
- THEN auto-optimize may place work into it
- AND it is considered after every dated release
- AND a ticket with a due date placed there is flagged as uncheckable

#### Scenario: Nothing to reason about

- WHEN no release is eligible, or no open ticket is unscheduled
- THEN auto-optimize proposes nothing
- AND it states the reason

#### Scenario: Explaining a limited proposal

- WHEN a proposal places fewer tickets than it considered
- THEN it states what limited it
- AND the reason names the releases that were frozen, shipped, at capacity, or undated

### Requirement: Ticket field tiers

Every ticket field SHALL belong to exactly one of three tiers: **core** (name,
summary, projects, externalUrl, dueDate, estimate), **optional** (type,
stakeholders, notes) or **background metadata** (state, opened, sprint,
carryovers, lastTouched, closed). The tiers SHALL NOT overlap.

#### Scenario: Core is asked for

- WHEN a ticket is created
- THEN name, summary, projects, external link, due date and estimated completion
  are requested
- AND the ticket can be saved with only a name filled in

#### Scenario: Optional is available but never required

- WHEN the ticket editor is open
- THEN type, stakeholders and notes are present in a collapsed group
- AND saving is possible without touching them

#### Scenario: Background metadata is not hand-entered

- WHEN the ticket editor is open
- THEN state, opened, release, lastTouched, closed and carryovers are shown
  read-only
- AND the only action offered there is recording that a carryover happened

#### Scenario: No field outside the tiers

- WHEN the stored ticket fields are inspected
- THEN they are exactly the core, optional and background fields
- AND owner, owner type, size and next-action are absent

### Requirement: Estimated completion length

A ticket SHALL carry an estimate of how many sprints it expects to take. A
ticket whose estimate cannot complete before its due date SHALL be reported as
not fitting.

#### Scenario: Estimate is expressed in sprints

- WHEN an estimate is chosen
- THEN it is one, two, or three-or-more sprints

#### Scenario: Will not fit before the due date

- WHEN the remaining time to a ticket's due date is less than its estimate
- THEN the ticket is reported as not fitting before its due date

### Requirement: Repairing releases with no dates

When releases have no dates, auto-optimize SHALL offer to give them a plain
cadence, oldest version first. It SHALL NOT invent dates without being asked, and
the result SHALL be a single revertible action.

#### Scenario: The offer appears only when needed

- WHEN at least one release has no release date
- THEN the proposal offers to fill the missing dates
- AND when every release already has dates the offer is absent

#### Scenario: Filling the dates

- WHEN the offer is taken
- THEN every release with no date is given a freeze date and a release date on a
  two-week cadence
- AND earlier versions receive earlier dates
- AND the change is one revertible action

### Requirement: Release capacity is measured in work

A release's load SHALL be the sum of the estimates of its open tickets, and
capacity SHALL be expressed in the same unit. A release SHALL be reported as full
when its load reaches capacity, and as over when it exceeds it. Capacity SHALL
NOT be measured by counting tickets.

#### Scenario: Load is work, not head count

- WHEN a release holds tickets whose estimates sum to more than its capacity
- THEN it is reported over capacity
- AND it is not reported as within capacity merely because its ticket count is low

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

### Requirement: Review sweep

The app SHALL provide a screen that steps through every ticket in scope and
raises alerts for data missing where its absence has a consequence and for work
going wrong. Every alert SHALL state why it matters. Tickets SHALL be ordered
worst first. The sweep SHALL be read-only: stepping through it SHALL change
nothing.

#### Scenario: Stepping through

- WHEN the sweep is opened
- THEN one ticket is shown at a time with its alerts
- AND it reports which ticket of how many is being shown
- AND it can step forward and back

#### Scenario: Missing data where it has a consequence

- WHEN a ticket has no summary, belongs to no project, has no stakeholder, or is
  committed with no due date
- THEN an alert naming what is missing is raised for it

#### Scenario: Work going wrong

- WHEN a ticket is past its due date, sits in a release that has already shipped,
  cannot finish before its due date, or carries a contradiction flag
- THEN an alert is raised for it

#### Scenario: Every alert explains itself

- WHEN an alert is raised
- THEN it states the consequence of the problem in words
- AND a problem that cannot state a consequence is not an alert

#### Scenario: Worst first

- WHEN the sweep is shown
- THEN tickets with the most alerts come first
- AND the next ticket with an alert can be jumped to

#### Scenario: Closed tickets are out of scope by default

- WHEN the sweep is opened
- THEN closed tickets are not swept
- AND including them is an explicit choice

#### Scenario: The sweep changes nothing

- WHEN a ticket is stepped past
- THEN nothing about it is modified
- AND editing it is a separate, explicit action

### Requirement: Weekly revisits

Deferred work SHALL be given a revisit date in whole weeks, and every revisit date
SHALL fall on the same day of the week, so that deferred work returns in one
batch. The revisit day SHALL be defined in one place. A deferred ticket whose
revisit day has arrived SHALL return to the decision queue ahead of undecided
work, and SHALL be shown as having come back.

#### Scenario: Weeks, not days

- WHEN a deferral is recorded
- THEN the revisit is chosen in whole weeks
- AND an arbitrary single date cannot be chosen

#### Scenario: Every revisit lands on the same day

- WHEN a revisit date is produced from any day of the week
- THEN it falls on the revisit day
- AND deferring on the revisit day itself is a full week out, not the same day

#### Scenario: Deferred work returns

- WHEN a deferred ticket's revisit day has arrived
- THEN it appears in the decision queue ahead of undecided work
- AND it is labelled as having come back for revisiting

#### Scenario: Returning is not automatic

- WHEN a deferred ticket's revisit day has not yet arrived
- THEN it does not appear in the decision queue

#### Scenario: Deciding again clears it

- WHEN a ticket that came back is accepted, declined, or deferred again
- THEN it stops returning
- AND deferring again moves the revisit to the later date

### Requirement: A long project list scales

The register SHALL remain usable with hundreds of projects. The picker SHALL render
a bounded number of suggestions regardless of how long the list is, and per-project
tallies SHALL be computed in a single pass over the tickets rather than one scan
per project.

#### Scenario: The picker stays bounded

- WHEN the project list holds hundreds of entries
- THEN the number of rendered suggestions does not grow with the list

#### Scenario: Tallies are not quadratic

- WHEN the project view computes how many tickets each project holds
- THEN every ticket is examined once per pass, not once per project
