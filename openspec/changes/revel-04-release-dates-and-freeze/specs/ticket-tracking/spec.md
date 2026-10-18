# ticket-tracking

## ADDED Requirements

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

#### Scenario: Nothing to reason about

- WHEN every eligible release is frozen, has shipped, or has no release date
- THEN auto-optimize proposes nothing

## MODIFIED Requirements

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

#### Scenario: Reordering a release

- WHEN a release is moved one place left
- THEN it swaps with its left neighbour
- AND the new order persists across a reload

#### Scenario: Order boundaries

- WHEN the leftmost release is moved left, or the rightmost is moved right
- THEN the order is unchanged

#### Scenario: Adding a release

- WHEN a release newer than every existing one is added
- THEN it is placed leftmost
- AND WHEN a release older than every existing one is added, it is placed rightmost
- AND the relative order of the existing releases is left alone

#### Scenario: One column per release

- WHEN the board is shown
- THEN there is a backlog column plus one column per release
- AND a ticket appears in the column of the release it is assigned to

#### Scenario: Unscheduling on release removal

- WHEN a release column is removed
- THEN its tickets become unscheduled
- AND they are not deleted

#### Scenario: Authoring dates

- WHEN a release's name is clicked on the board
- THEN its freeze and release dates can be viewed and changed
