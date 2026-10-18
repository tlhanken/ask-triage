# ticket-tracking

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Relevant projects

A ticket SHALL belong to zero or more projects drawn from a controlled list. The
list SHALL be defined in one place and drive every project display. Choosing a
project SHALL narrow the controlled list by a typed filter and attach a project
from what remains; projects SHALL NOT be created by typing.

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

#### Scenario: Attaching and detaching

- WHEN an offered project is clicked
- THEN it is attached to the ticket
- AND clicking an attached project's chip removes it

#### Scenario: The list stays controlled

- WHEN the typed text matches no project
- THEN no project is offered and no project is created
- AND the editor says the list is fixed
