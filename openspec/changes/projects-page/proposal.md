# Projects page: create, rename, and see every date

## Why

Projects can be added from the ticket form. Add and remove are tucked inside a
collapsed panel on the Projects tab, and the switcher is one chip per project,
which won't scale. There is **no rename**: the only route is remove and add,
and removing detaches the project from every ticket. Nor is there one place to
see and fix the due dates for a project's tickets, which is the view Trevor
asked for.

## What Changes

- **A list and a detail.** The list, on the left, has search, open/critical
  counts per project, and "+ New project" at the top. The selected project
  shows on the right.
- **Rename in place.** The new name carries through to every ticket that
  carries the project, as one revertible action. A name that already exists is
  refused, so two projects are never merged by accident.
- **Remove** says how many tickets it will detach from before it does anything.
- **Due dates for the project.** The project's open tickets are shown in a
  table sorted by due date: name, ship release, due date, estimate. The due
  date can be edited in the row, including setting "no hard date". Each row
  shows a fit warning (won't fit, past due, ships after its due date). Every
  edit is recorded in History.
- The ticket form keeps creating projects from its picker.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking`: "Editing the project list" gains rename. A new
  requirement covers the project date view. "A long project list scales" is
  met by the list. Spec deltas will be written once this design is agreed.

## Impact

Code: `Projects.tsx` rewritten as a list and detail. `store.ts` gets
`renameProject`, with tests. The fit warnings come from the audit, so their
wording matches Check.

Data: none.

Defaults, since Trevor did not object: a project is a **name only**. No archive,
no owner, no tracker URL, until something in the app reads them. A bulk "shift
all dates by N weeks", and editing priority or estimate in the table, are left
for later.

Order: after `plan-workflow`. The fit warnings and the "no hard date" choice
come from it.
