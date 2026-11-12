# Design: projects-page

Settled 2026-11-01, after `plan-workflow`, which supplies the "no hard date"
choice and the fit checks this page reuses.

## Shape

    ┌ list ───────────┐ ┌ detail ─────────────────────────────────────────┐
    │ search…         │ │ Atlas   [rename] [remove]                       │
    │ + New project   │ │ 4 open · 1 critical                             │
    │ Atlas    4 · 1c │ │ ticket          ships in  due         est  fit   │
    │ Borealis 2      │ │ SSO for …       v0.24     [2026-11-15] 2   late  │
    │ …               │ │ …                                               │
    └─────────────────┘ └─────────────────────────────────────────────────┘

The list reuses `matchProjects` and its cap, so it stays bounded at hundreds of
projects, and states how many it left out. Counts are the existing single-pass
tally.

## Rename

`renameProject(store, from, to)` in the store, pure like every other mutation:

- trims `to`; refuses blank, unchanged, or a name already in the list (exact
  match, the same rule `addProject` uses) by returning the store unchanged, so
  the history layer records nothing;
- keeps the project's position in the list;
- rewrites the name on every ticket that carries it.

The decision log is not rewritten. It is an append-only record of what was
decided at the time, including the projects a ticket carried then.

## Due dates in the row

The row uses the shared `DueField`, so "no hard date" works the same as on the
Fill out card and in the editor. The fit column shows the ticket's
`riskAlerts` of kind PAST-DUE, WONT-FIT and STARTS-LATE, so the words match
Check exactly.

## One accept rule

An edit from the project table can answer a ticket's last required field. So
can the ticket editor. Rather than special-case the Fill out card, every edit
goes through one store function, `editTicket` (formerly `fillOut`): it applies
the patch, and if the ticket has just become ready, records Accept. The Fill
out card, the editor and the project table all call it.

## Left out, as the proposal says

Archive, owner, tracker URL; bulk date shifts; editing priority or estimate in
the table.
