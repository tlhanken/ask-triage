# ticket-tracking

## ADDED Requirements

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
