# ticket-tracking

## ADDED Requirements

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

## MODIFIED Requirements

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
