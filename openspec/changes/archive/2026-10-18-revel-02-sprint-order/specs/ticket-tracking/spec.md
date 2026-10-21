# ticket-tracking

## MODIFIED Requirements

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
