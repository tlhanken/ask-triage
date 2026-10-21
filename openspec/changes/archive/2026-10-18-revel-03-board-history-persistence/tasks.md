# Tasks

## Board

- [x] Cards are draggable between release columns, and back to the backlog
- [x] Drop reads the dragged id from component state, falling back to `dataTransfer`
- [x] Drop target and dragged card are visually marked
- [x] Per-ticket release selector retained for keyboard use

## Auto-optimize

- [x] `optimizePlan` proposes only for open tickets with no release
- [x] Only releases at or after the current one, earliest first
- [x] Capacity-aware; dated work before undated work, then draft score
- [x] Reason per move names what is true (critical / due date / score) and the fill
- [x] Preview panel with Apply and Discard; nothing moves until Apply
- [x] `applyPlan` commits the batch; it is a single revertible action

## History

- [x] Every mutation goes through one helper that records a labelled snapshot first
- [x] A mutation that changes nothing records no snapshot
- [x] `revertTo` restores tickets and settings; the revert is itself recorded
- [x] History capped at 25, oldest dropped
- [x] Reverting a deletion restores the ticket without reusing the id
- [x] History tab lists entries with revert buttons and states the decision-log caveat

## Persistence

- [x] `data/register.json` written through a dev/preview-server endpoint
- [x] File System Access API fallback, then download
- [x] Autosave debounced so a burst of drags is one write
- [x] A browser with state is not clobbered by the file; an empty browser adopts it
- [x] No database; rationale recorded in design.md

## Verification

- [x] Typecheck passes (`tsc --noEmit`), including the Vite config
- [x] 61 tests pass: drag between columns and back, preview-then-apply,
      discard, labelled history, revert, history cap, id reuse, and the
      optimizer's constraints
- [x] Production build succeeds
- [x] The file endpoint was exercised against a running server: `POST /__data`
      returned ok and `data/register.json` exists on disk with the posted content
