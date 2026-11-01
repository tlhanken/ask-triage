## 1. Store

- [x] 1.1 `renameProject`: refuse blank, unchanged and existing names; keep position;
      carry through tickets; leave the decision log alone
- [x] 1.2 Rename `fillOut` to `editTicket`, and use it for every ticket edit
- [x] 1.3 `projectTickets`: a project's open tickets sorted by due date

## 2. Interface

- [x] 2.1 Projects page as list (search, counts, + New project, bounded) and detail
- [x] 2.2 Rename in place and remove with its count, both revertible
- [x] 2.3 Due-date table: ship release, inline due date with no hard date, estimate,
      fit warnings in Check's words

## 3. Verification

- [x] 3.1 Store tests for rename and the date order; interface tests for the page
- [x] 3.2 typecheck, lint, test, build, `openspec validate projects-page --strict`
- [x] 3.3 README: drop the "Not done yet" entry
- [x] 3.4 Archive into `ticket-tracking`
