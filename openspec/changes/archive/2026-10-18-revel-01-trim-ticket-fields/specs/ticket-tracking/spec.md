# ticket-tracking

## ADDED Requirements

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

Sprint columns SHALL be named as version strings and SHALL sort numerically.

#### Scenario: Numeric ordering

- WHEN the sprint names `v0.9`, `v0.21` and `v0.22` are sorted
- THEN the order is `v0.9`, `v0.21`, `v0.22`

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

Ticket data SHALL be stored on the user's machine. A save produced by an
incompatible earlier model SHALL NOT be loaded partially.

#### Scenario: Incompatible save

- WHEN the stored data does not match the current model
- THEN the application starts from the seed data instead of loading it

### Requirement: Updating people without a backend

The system SHALL produce a decision summary and a per-project summary, and SHALL
allow the register to be exported as CSV and JSON.

#### Scenario: Summary export

- WHEN decisions have been recorded
- THEN a markdown summary groups them by accepted, deferred, declined and blocked
- AND every deferral carries its reason and revisit date
