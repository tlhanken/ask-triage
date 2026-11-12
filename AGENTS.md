# Working in this repo

Read `ARCHITECTURE.md` first: the layout, the layer rules, the model's invariants
and step-by-step recipes for common changes. `README.md` covers using the app.

## Before you finish

    npm run typecheck && npm run lint && npm test && npm run build

All four must pass. CI runs the same. `just check` runs the same four.

## Rules

- **Pure domain.** Logic goes in `src/domain/`, as functions that take a store and
  return a new one, or the same one when nothing changed. No React, DOM,
  `localStorage` or `fetch` there; lint enforces it.
- **One home per rule.** Find the module that owns the behaviour (the layout in
  ARCHITECTURE.md) and change it there. Do not copy logic into a screen.
- **Every change goes through `act`** in `src/ui/App.tsx`, so it is recorded in
  History and revertible.
- **Every ticket edit goes through `updateTicket`, `editTicket` or a decision**, so
  the ticket invariants hold.
- **Tests beside the code.** A change to `src/domain/x.ts` updates
  `src/domain/x.test.ts`. Domain tests call `freezeClock()`; never use the real clock.
- **Behaviour changes go through OpenSpec** (`openspec/`, see ARCHITECTURE.md).
  Refactors do not.
- **No migrations yet.** The app has no real users. A format change bumps
  `STORE_VERSION`; older registers are refused, and the server keeps a backup.
- Write plainly. Comments say why, not what.
