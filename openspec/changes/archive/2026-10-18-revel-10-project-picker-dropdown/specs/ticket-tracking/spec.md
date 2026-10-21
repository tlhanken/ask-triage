# ticket-tracking

## MODIFIED Requirements

### Requirement: Relevant projects

A ticket SHALL belong to zero or more projects drawn from a controlled list. The
list SHALL be defined in one place and drive every project display. Choosing a
project SHALL narrow the controlled list by a typed filter and offer the result as
a bounded suggestion list; projects SHALL NOT be created by typing.

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
- THEN no project is offered and no project is created
- AND the editor says the list is fixed

## ADDED Requirements

### Requirement: A long project list scales

The register SHALL remain usable with hundreds of projects. The picker SHALL render
a bounded number of suggestions regardless of how long the list is, and per-project
tallies SHALL be computed in a single pass over the tickets rather than one scan
per project.

#### Scenario: The picker stays bounded

- WHEN the project list holds hundreds of entries
- THEN the number of rendered suggestions does not grow with the list

#### Scenario: Tallies are not quadratic

- WHEN the project view computes how many tickets each project holds
- THEN every ticket is examined once per pass, not once per project
