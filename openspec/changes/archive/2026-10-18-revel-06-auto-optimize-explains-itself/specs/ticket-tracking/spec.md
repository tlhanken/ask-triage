# ticket-tracking

## MODIFIED Requirements

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

## ADDED Requirements

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
