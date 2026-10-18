# ticket-tracking Specification

## Purpose
TBD - created by archiving change revel-01-trim-ticket-fields. Update Purpose after archive.

## Requirements

### Requirement: Field discipline

The ticket model SHALL store only fields that drive a decision, a flag, a score
term, or a view. A field that merely restates other data SHALL NOT be stored.

#### Scenario: The stored field set

- WHEN the ticket model is inspected
- THEN it carries exactly these fields: id, name, summary, projects, externalUrl,
  dueDate, ownerType, owner, stakeholders, type, size, state, opened, sprint,
  carryovers, lastTouched, closed, nextAction

#### Scenario: Rejecting a derivable field

- WHEN a field can be derived from data already stored
- THEN it is not stored, and the value is derived on read
- AND an example is the external ticket key, which is derived from the external
  ticket link

#### Scenario: The editor asks only what a person decides

- WHEN a ticket is created or edited
- THEN the editor requests name, summary, projects, external link, due date,
  type, size, owner type, owner, stakeholders and next action
- AND app-stamped fields (opened, lastTouched, closed) and loop-set fields
  (sprint, state) are presented separately and marked as corrections

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
list SHALL be defined in one place and drive every project display.

#### Scenario: Multiple projects

- WHEN a ticket is assigned to Atlas and Platform
- THEN it appears in the project view for both
- AND it appears in neither for any project it is not assigned to

#### Scenario: Project view is trustworthy

- WHEN the project view lists a project's tickets
- THEN every ticket shown is assigned to that project
- AND no ticket is shown that is not assigned to it

### Requirement: Version sprints

Sprint columns SHALL be named as version strings. Version strings SHALL be
compared numerically, not as text. The stored order of sprint columns SHALL
govern their display order, SHALL default to newest release first, and SHALL be
changeable by the owner.

#### Scenario: Numeric ordering

- WHEN the sprint names `v0.9`, `v0.21` and `v0.22` are compared
- THEN `v0.9` sorts before `v0.21`, and `v0.21` before `v0.22`

#### Scenario: Default display order

- WHEN the board is shown for the first time
- THEN the columns read backlog, `v0.25`, `v0.24`, `v0.23`, `v0.22`, `v0.21`
- AND the newest release is leftmost

#### Scenario: Reordering a sprint

- WHEN a sprint is moved one place left
- THEN it swaps with its left neighbour
- AND the new order persists across a reload

#### Scenario: Order boundaries

- WHEN the leftmost sprint is moved left, or the rightmost is moved right
- THEN the order is unchanged

#### Scenario: Adding a sprint

- WHEN a sprint newer than every existing one is added
- THEN it is placed leftmost
- AND WHEN a sprint older than every existing one is added, it is placed rightmost
- AND the relative order of the existing sprints is left alone

#### Scenario: One column per sprint

- WHEN the sprint board is shown
- THEN there is a backlog column plus one column per sprint
- AND a ticket appears in the column of the sprint it is assigned to

#### Scenario: Unscheduling on sprint removal

- WHEN a sprint column is removed
- THEN its tickets become unscheduled
- AND they are not deleted

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
exceed the configured capacity per release, SHALL NOT propose a release that has
already shipped, and SHALL order dated work before undated work.

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
