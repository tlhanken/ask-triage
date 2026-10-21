# ticket-tracking

## ADDED Requirements

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

## MODIFIED Requirements

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
