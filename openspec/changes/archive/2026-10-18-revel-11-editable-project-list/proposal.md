# Projects become editable data, with removal that detaches

## Why

The project list was compile-time: a `const` array with a union type derived from
it. That is why the picker could filter the list but never extend it, and why a
project could only ever be removed by editing the source and shipping a build.

## What Changes

- **BREAKING** The list moves into the register: `settings.projects`. `ProjectId`
  becomes a string. `DEFAULT_PROJECTS` is now just what a fresh register starts
  with.
- **Adding is explicit, never incidental.** The picker offers "add to the list"
  only when a typed name matches nothing, and the project view has a manage panel
  with an add field. Typing alone still creates nothing, so a typo cannot quietly
  become a project.
- **Removing detaches it from every ticket carrying it**, after naming how many
  that is. Leaving the name on the tickets would keep them out of every project
  view — the tickets would vanish from the only place that shows them.
- A removal is one revertible action through the existing history layer.
- A save whose list has lost a name its tickets still carry gets that name back:
  migration unions in anything the tickets reference, so a ticket cannot be
  orphaned by a list that forgot it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — the project requirement now covers an editable list, and a
  new requirement covers adding and removing.

## Impact

Code: `schema.ts` (`DEFAULT_PROJECTS`, `ProjectId`, `Settings.projects`),
`store.ts` (`addProject`, `removeProject`, `projectUsage`, migration),
`TicketForm.tsx`, `Projects.tsx`, `App.tsx`, tests.

Data: `settings.projects` is new; a save without it is seeded from
`DEFAULT_PROJECTS` plus any names its tickets reference. Existing tickets keep
every project they had.
