## ADDED Requirements

### Requirement: Project page as a list and a detail

The Projects page SHALL show the project list on one side and the selected
project on the other. The list SHALL be searchable, SHALL show each project's
open and critical counts, and SHALL offer creating a project at its top. A project
SHALL be a name only.

#### Scenario: Finding a project

- WHEN part of a project name is typed into the list's search
- THEN only matching projects are listed, with their open and critical counts

#### Scenario: Creating a project

- WHEN a new project is created from the top of the list
- THEN it joins the list and is selected

### Requirement: Project due dates

The selected project SHALL show its open tickets in a table sorted by due date,
with each ticket's name, ship release, due date and estimate. The due date SHALL
be editable in the row, including choosing no hard date, and each edit SHALL be
recorded in History. Each row SHALL show a fit warning when the ticket is past
due, ships after its due date, or starts too late.

#### Scenario: Sorted by date

- WHEN a project's tickets are shown
- THEN dated tickets come first, earliest first, then those with no hard date,
  then those not answered yet

#### Scenario: Editing a date in the row

- WHEN a ticket's due date is changed in the table
- THEN the ticket carries the new date
- AND the change appears in History and can be reverted

#### Scenario: A fit warning

- WHEN a ticket in the table ships after its due date
- THEN its row says so, in the same words Check uses

### Requirement: A ticket that becomes ready is accepted

Whenever an edit answers a ticket's last missing required field, from any screen,
an accept SHALL be recorded in the decision log and the ticket SHALL move to
Schedule.

#### Scenario: Ready from the project table

- WHEN the last required field of a ticket is its due date, and it is set in the
  project table
- THEN an accept is recorded and the ticket is ready to schedule

## MODIFIED Requirements

### Requirement: Editing the project list

Projects SHALL be addable, renamable and removable at runtime. Renaming a project
SHALL carry the new name to every ticket that carries it, and SHALL refuse a name
already in the list. Removing a project SHALL detach it from every ticket that
carried it, and SHALL state how many tickets that is before doing so. A rename or
a removal SHALL be a single revertible action.

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

#### Scenario: Renaming carries through

- WHEN a project is renamed
- THEN it keeps its place in the list under the new name
- AND every ticket that carried the old name carries the new one
- AND the rename is one revertible action

#### Scenario: A rename never merges

- WHEN a project is renamed to a name already in the list, or to a blank name
- THEN the rename is refused and nothing changes

### Requirement: A long project list scales

The register SHALL remain usable with hundreds of projects. The picker and the
project list SHALL render a bounded number of entries regardless of how long the
list is, and per-project tallies SHALL be computed in a single pass over the
tickets rather than one scan per project.

#### Scenario: The picker stays bounded

- WHEN the project list holds hundreds of entries
- THEN the number of rendered suggestions does not grow with the list

#### Scenario: Tallies are not quadratic

- WHEN the project view computes how many tickets each project holds
- THEN every ticket is examined once per pass, not once per project

#### Scenario: The project list stays bounded

- WHEN the Projects page lists hundreds of projects
- THEN a bounded number is shown, the total is stated, and search narrows it
