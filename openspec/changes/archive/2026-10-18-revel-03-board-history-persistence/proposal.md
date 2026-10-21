# Assign releases by hand, propose them automatically, and be able to undo either

## Why

Flagging a ticket for a release is the most repeated action on this board, so it
should be a drag rather than a dropdown. Placing a whole backlog by hand is also
tedious, but any automatic placement has to be undoable in one move — and so does
every other change. And "undo" only covers the last twenty-five actions; the real
backstop for version control is a file git can diff.

## What Changes

- Tickets on the sprint board are draggable between release columns (and back to
  the backlog). The per-card release selector stays, for keyboard use.
- **Auto-optimize** proposes releases for tickets that have none: capacity-aware,
  dated work first, current release onwards only, and it never moves work that is
  already scheduled. The proposal is previewed with a reason per move and only
  applied on Apply.
- Every change records the state it is about to replace, under a label, in an
  in-app history that can be reverted to. A revert is itself recorded, so it can
  be undone. History is capped at 25 entries.
- Persistence gains a second layer: when a dev or preview server is present, the
  register is written to `data/register.json` so git can diff and revert it. With
  no server it falls back to the File System Access API, then to download.
- **No database.** Rationale in design.md.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — the persistence requirement now covers two layers and the
  file endpoint; three requirements are added: release assignment by dragging,
  auto-optimize as a proposal, and version history with revert.

## Impact

Code: `store.ts` (history, `withHistory`, `revertTo`, `optimizePlan`, `applyPlan`),
`persist.ts` (new), `History.tsx` (new), `Sprints.tsx`, `App.tsx`, `vite.config.ts`
(local file endpoint), `styles.css`, tests.

Data: `data/register.json` becomes a tracked file. The store gains a `history`
array; saves without it are defaulted rather than invalidated.

Tooling: `@types/node` added so the Vite config can be typechecked.
