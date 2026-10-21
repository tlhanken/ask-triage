# Read the sprint board newest-release first, and let it be reordered

## Why

The board reads left to right, but the leftmost sprint was the oldest release, so
the eye landed on history instead of on what is next. Releases also do not always
ship in version order, so the ordering has to be the owner's to set rather than a
fixed rule.

## What Changes

- The default sprint order becomes newest release first: `v0.25`, `v0.24`,
  `v0.23`, `v0.22`, `v0.21`, with `v0.23` still the current sprint.
- Sprint columns become reorderable with a left/right control on each column
  head; the order is stored and survives reload.
- Adding a sprint slots it in by version relative to the existing list instead of
  re-sorting the whole list (which would discard a manual arrangement).
- No new stored field: the sprint array itself is the display order.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — the "Version sprints" requirement changes: numeric
  comparison now determines only the default order and where a new sprint lands;
  the stored order governs display and is owner-controlled.

## Impact

Code: `schema.ts` (default order), `store.ts` (`addSprint`, new `shiftSprint`),
`Sprints.tsx`, `App.tsx`, `styles.css`, tests.

Data: order lives in the existing `settings.sprints` array; no migration and no
storage-key change.
