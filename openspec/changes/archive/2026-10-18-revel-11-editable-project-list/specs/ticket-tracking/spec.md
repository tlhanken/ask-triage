# ticket-tracking

## MODIFIED Requirements

### Requirement: Relevant projects

A ticket SHALL belong to zero or more projects drawn from a controlled list. The
list SHALL be stored with the register and SHALL drive every project display.
Choosing a project SHALL narrow the list by a typed filter and offer the result as
a bounded suggestion list; projects SHALL NOT be created by typing alone.

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
- THEN no project is offered and no project is created by that act alone
- AND adding one is available as a separate, explicit action

#### Scenario: Adding from the picker

- WHEN a typed name matches nothing and the add action is taken
- THEN the name joins the controlled list
- AND it is attached to the ticket being edited

## ADDED Requirements

### Requirement: Editing the project list

Projects SHALL be addable and removable at runtime. Removing a project SHALL
detach it from every ticket that carried it, and SHALL state how many tickets that
is before doing so. A removal SHALL be a single revertible action.

#### Scenario: Adding a project

- WHEN a new project name is added
- THEN it joins the list and is offered everywhere the list is used
- AND a blank or duplicate name is refused without changing anything

#### Scenario: Removing a project names its consequence

- WHEN a project is removed
- THEN the number of tickets that will be detached from it is stated first
- AND the removal proceeds only on confirmation

#### Scenario: Removal detaches rather than orphans

- WHEN a project with tickets is removed
- THEN it leaves the list
- AND every ticket that carried it no longer does
- AND no ticket is deleted or otherwise changed

#### Scenario: A removal is revertible

- WHEN a removal is reverted
- THEN the project returns to the list and to the tickets that carried it

#### Scenario: A name the tickets still carry is kept

- WHEN a save's list has lost a name that tickets still reference
- THEN that name is restored to the list
- AND no ticket is left referencing a project no view can show
