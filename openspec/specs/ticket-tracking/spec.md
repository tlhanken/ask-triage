# ticket-tracking Specification

## Purpose

Track the software asks the team and the partner company owe, and decide what to do
about them week by week.

The unit is the ask, not the project: work is captured, ranked, triaged, assigned to
releases, audited and reported from one register. It runs in a browser with no
backend and keeps its state in a local JSON file.

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
list SHALL be stored with the register and SHALL drive every project display.
Choosing a project SHALL narrow the list by a typed filter and offer the result as
a bounded suggestion list; projects SHALL NOT be created by typing alone.

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
- THEN no project is offered and no project is created by that act alone
- AND adding one is available as a separate, explicit action

#### Scenario: Adding from the picker

- WHEN a typed name matches nothing and the add action is taken
- THEN the name joins the controlled list
- AND it is attached to the ticket being edited

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
the register SHALL additionally be written to a JSON file on the user's machine
outside version control, so that no real ask is ever committed. While the server
is present, that file SHALL be the source of truth: browser storage SHALL be a
cache of it.

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

- WHEN the application starts with a server present and a register file exists
- THEN the file is loaded, whatever browser storage holds
- AND nothing is written to the file until that load has finished

#### Scenario: Establishing the file

- WHEN the application starts with a server present and no register file exists
- THEN the browser's register is written to establish it

#### Scenario: A file this version cannot read

- WHEN the application starts with a server present and the register file is not
  one this version can read
- THEN nothing is written to the file automatically
- AND the application says so, and replaces the file only when the user saves to
  it deliberately

### Requirement: Updating people without a backend

The system SHALL produce a decision summary and a per-project summary, and SHALL
allow the register to be exported as CSV and JSON.

#### Scenario: Summary export

- WHEN decisions have been recorded
- THEN a markdown summary groups them by accepted, deferred, declined, blocked,
  done and carried over
- AND every deferral and every block carries its reason and revisit date

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

### Requirement: Version history and revert

Every change SHALL record what is needed to restore the state it is about to
replace, under a human-readable label. Recording a change SHALL NOT store a
further full copy of the register. The history SHALL be viewable and SHALL allow
restoring the state from before any recorded change. A revert SHALL itself be
recorded so that it can be undone. History SHALL NOT rewrite the decision log.

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

#### Scenario: History does not scale with the register

- WHEN the history cap is reached
- THEN the retained entries are not each a full copy of the register
- AND the size of the history is governed by the changes recorded, not by the
  number of tickets in the register

#### Scenario: Reverting to the oldest retained change

- WHEN the oldest entry the history still holds is reverted to
- THEN the state from before that change is restored
- AND the revert is reported as reaching the oldest state the history holds

#### Scenario: A damaged entry

- WHEN a revert would pass through a history entry that cannot be read
- THEN nothing is reverted and the application says why

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
before the ticket's due date. When no release ships in time it SHALL say so.

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

### Requirement: A long project list scales

The register SHALL remain usable with hundreds of projects. The picker and the
project list SHALL render a bounded number of entries regardless of how long the
list is, and per-project tallies SHALL be computed in a single pass over the
tickets rather than one scan per project.

#### Scenario: The picker stays bounded

- WHEN the project list holds hundreds of entries
- THEN the number of rendered suggestions does not grow with the list

#### Scenario: Tallies are not quadratic

- WHEN the project view computes how many tickets each project holds
- THEN every ticket is examined once per pass, not once per project

#### Scenario: The project list stays bounded

- WHEN the Projects page lists hundreds of projects
- THEN a bounded number is shown, the total is stated, and search narrows it

### Requirement: Editing the project list

Projects SHALL be addable, renamable and removable at runtime. Renaming a project
SHALL carry the new name to every ticket that carries it, and SHALL refuse a name
already in the list. Removing a project SHALL detach it from every ticket that
carried it, and SHALL state how many tickets that is before doing so. A rename or
a removal SHALL be a single revertible action.

#### Scenario: Adding a project

- WHEN a new project name is added
- THEN it joins the list and is offered everywhere the list is used
- AND a blank or duplicate name is refused without changing anything

#### Scenario: Removing a project names its consequence

- WHEN a project is removed
- THEN the number of tickets that will be detached from it is stated first
- AND the removal proceeds only on confirmation

#### Scenario: Removal detaches rather than orphans

- WHEN a project with tickets is removed
- THEN it leaves the list
- AND every ticket that carried it no longer does
- AND no ticket is deleted or otherwise changed

#### Scenario: A removal is revertible

- WHEN a removal is reverted
- THEN the project returns to the list and to the tickets that carried it

#### Scenario: A name the tickets still carry is kept

- WHEN a save's list has lost a name that tickets still reference
- THEN that name is restored to the list
- AND no ticket is left referencing a project no view can show

#### Scenario: Renaming carries through

- WHEN a project is renamed
- THEN it keeps its place in the list under the new name
- AND every ticket that carried the old name carries the new one
- AND the rename is one revertible action

#### Scenario: A rename never merges

- WHEN a project is renamed to a name already in the list, or to a blank name
- THEN the rename is refused and nothing changes

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

### Requirement: The register file is written safely

The file endpoint SHALL replace the register file in a single step, so that a
failed write leaves the previous register whole. It SHALL refuse a write that is
not sent as JSON, or that comes from an origin other than its own, before it
reads the body. It SHALL serve only its own path.

#### Scenario: A write that fails part-way

- WHEN a write to the register file fails before it completes
- THEN the previous register file is unchanged
- AND no temporary file is left beside it

#### Scenario: A write from another site

- WHEN a page from another origin posts to the file endpoint
- THEN the write is refused and the file is unchanged

#### Scenario: A write that is not JSON

- WHEN a write arrives with a content type other than JSON
- THEN it is refused and the file is unchanged

#### Scenario: The application's own write over the network

- WHEN the application is reached by another host name, such as over a private
  network, and saves
- THEN the write is accepted

### Requirement: A format change keeps the old file

When a write changes the register's stored format version, the file endpoint
SHALL first keep the file it replaces beside the register, under a name that
records its format and when it was replaced, and SHALL NOT modify that copy
afterwards.

#### Scenario: A format change keeps the old file

- WHEN a write replaces a register file stored in a different format version
- THEN the replaced file is kept, unchanged, beside the register
- AND a write that keeps the format version keeps no copy

### Requirement: Every load path reads the same way

Browser storage, the file endpoint, and a file the user picks SHALL all be read by
the same parse, validate, and migrate steps. A register that does not pass them
SHALL be refused whole and SHALL NOT replace the current state.

#### Scenario: A file that is not a register

- WHEN the user loads a file that has no settings, or comes from an unknown
  version
- THEN the application says it cannot read it
- AND the current register is unchanged

### Requirement: Dates are local

Timestamps SHALL be stored in UTC and SHALL be shown, and compared with dates,
as the user's local date and time. A day count SHALL step calendar days, so
that crossing a daylight-saving change cannot skip or repeat a date. A release
SHALL be frozen on its freeze day, so a ticket placed into it that day SHALL count
as scope after freeze.

#### Scenario: An evening edit

- WHEN a change is made late in the evening, west of Greenwich
- THEN History, Decisions, exports and their filenames show that day, not the
  next

#### Scenario: Placed on the freeze day

- WHEN a ticket is placed into a release on its freeze day
- THEN it is counted as scope after freeze

#### Scenario: Across a clock change

- WHEN a date is computed a number of days ahead across a daylight-saving change
- THEN it lands on the same calendar date as it would without the change

### Requirement: Stale writes are refused

Every write to the register file SHALL identify the version of the file it was
based on. The server SHALL refuse a write based on a version that is no longer
current. After a refused write the application SHALL stop writing to the file,
SHALL say that another tab or machine changed the register, and SHALL offer to
reload the file or to download its own copy first.

#### Scenario: Two tabs

- WHEN a change is saved from one tab, and then a change is made in a second
  tab that loaded the file earlier
- THEN the second tab's write is refused and the file keeps the first tab's
  change
- AND the second tab says why, and offers to reload or to download its copy

#### Scenario: Nothing is lost by a refusal

- WHEN a write is refused and the user downloads this tab's copy
- THEN the download holds every change made in this tab

#### Scenario: An ordinary save

- WHEN only one tab is open and changes are made
- THEN every write is accepted

#### Scenario: A write that does not say what it was based on

- WHEN a write that names no version arrives and a register file already exists
- THEN it is refused and the file is unchanged

#### Scenario: A hand edit

- WHEN the register file is edited outside the application after a tab loaded it
- THEN that tab's next write is refused

#### Scenario: Reloading after a refusal

- WHEN the user reloads the file after a refused write
- THEN the tab shows the file's register, including its history, and saving
  resumes

### Requirement: The durable register stays one transportable file

The durable record SHALL remain a single file that can be exported, downloaded and
re-imported as a unit, so that a register moves between machines or to another
person by transferring one file. Keeping the history small SHALL NOT require
splitting the durable record across several files.

#### Scenario: Moving a register

- WHEN the user downloads the register and re-imports it elsewhere
- THEN the tickets, the decisions and the history all arrive together

#### Scenario: A full history does not force a split

- WHEN the history cap is reached
- THEN the register is still one file

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

### Requirement: Project page as a list and a detail

The Projects page SHALL show the project list on one side and the selected
project on the other. The list SHALL be searchable, SHALL show each project's
open and critical counts, and SHALL offer creating a project at its top. A project
SHALL be a name only.

#### Scenario: Finding a project

- WHEN part of a project name is typed into the list's search
- THEN only matching projects are listed, with their open and critical counts

#### Scenario: Creating a project

- WHEN a new project is created from the top of the list
- THEN it joins the list and is selected

### Requirement: Project due dates

The selected project SHALL show its open tickets in a table sorted by due date,
with each ticket's name, ship release, due date and estimate. The due date SHALL
be editable in the row, including choosing no hard date, and each edit SHALL be
recorded in History. Each row SHALL show a fit warning when the ticket is past
due, ships after its due date, or starts too late.

#### Scenario: Sorted by date

- WHEN a project's tickets are shown
- THEN dated tickets come first, earliest first, then those with no hard date,
  then those not answered yet

#### Scenario: Editing a date in the row

- WHEN a ticket's due date is changed in the table
- THEN the ticket carries the new date
- AND the change appears in History and can be reverted

#### Scenario: A fit warning

- WHEN a ticket in the table ships after its due date
- THEN its row says so, in the same words Check uses

### Requirement: A ticket that becomes ready is accepted

Whenever an edit answers a ticket's last missing required field, from any screen,
an accept SHALL be recorded in the decision log and the ticket SHALL move to
Schedule.

#### Scenario: Ready from the project table

- WHEN the last required field of a ticket is its due date, and it is set in the
  project table
- THEN an accept is recorded and the ticket is ready to schedule

### Requirement: Planning settings are editable

Release capacity, sprint length, throughput, the flag thresholds and the
draft-score weights SHALL be editable in the application. Each setting SHALL
state what it drives. Saving SHALL be a single revertible action, and an invalid
value SHALL be refused with its reason. The releases and the project list keep
their own editors.

#### Scenario: Changing capacity

- WHEN capacity per release is changed and saved
- THEN every release's load is measured against the new capacity
- AND the change appears in History and can be reverted

#### Scenario: Every setting explains itself

- WHEN the settings are open
- THEN each setting names what it drives

#### Scenario: An invalid value

- WHEN capacity is set to zero, or a weight to a negative number
- THEN the problem is named next to the field
- AND nothing is saved until it is fixed

#### Scenario: Restoring defaults

- WHEN defaults are restored in the settings
- THEN the form shows the default values
- AND nothing changes until they are saved

#### Scenario: Saving nothing new

- WHEN the settings are saved unchanged
- THEN no history entry is recorded

### Requirement: The application keeps its own history

The register file SHALL NOT be the only way to recover an earlier state. The
application SHALL keep its own history of the register, inside the register, and
SHALL revert from it.

#### Scenario: Reverting with no file at all

- WHEN the application runs from a static build, with no register file, and a
  change is made
- THEN the change can be reverted from History

### Requirement: Working without a server

When no development or preview server is present, the application SHALL offer a
file-based alternative to the register file, and a download of the register.

#### Scenario: Keeping a copy from a static build

- WHEN the application runs with no server and the register is downloaded
- THEN the download holds the whole register, history included

### Requirement: An incompatible save is refused whole

A save produced by an incompatible earlier model SHALL NOT be loaded partially:
it SHALL be refused whole, from every load path.

#### Scenario: An older format in browser storage

- WHEN browser storage holds a register in an earlier stored format
- THEN none of it is loaded, and the application starts from the seed data

### Requirement: Releases with no date stay usable

A release with no release date SHALL remain usable for auto-optimize, SHALL be
considered after every dated release, and SHALL mark any dated ticket placed into
it as uncertain.

#### Scenario: Dated releases are filled first

- WHEN a dated release and an undated one both have room for a ticket
- THEN auto-optimize proposes the dated one

### Requirement: Auto-optimize explains itself

Auto-optimize SHALL state the reason whenever it proposes nothing, and SHALL
state what limited it whenever it places fewer tickets than it considered.

#### Scenario: Every release is frozen

- WHEN every release that has not shipped is frozen
- THEN auto-optimize proposes nothing
- AND it names the frozen releases as the reason
