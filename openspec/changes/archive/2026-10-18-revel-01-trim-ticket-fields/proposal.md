# Trim ticket fields and version the sprints

## Why

The register grew a field per good idea and reached 23 fields per ticket — the
first step toward rebuilding the bloatware it replaced. Separately, sprint names
(`S-07`) do not match how this work is released, which is `v0.x`.

## What Changes

- **BREAKING** Remove three fields from the ticket model: `notes` (freeform
  graveyard), `externalKey` (derivable from the link), `expectedDurations`
  (redundant with the carryover rule).
- **BREAKING** Rename for clarity: `committedCycle` → `sprint`,
  `cycleLabel` → `currentSprint`, `commitTargetPerCycle` →
  `commitTargetPerSprint`.
- Sprint columns become version names (`v0.21`, `v0.22`, …) and sort
  numerically rather than lexically.
- SLIPPED fires at one carryover threshold instead of comparing carryovers
  against a stored estimate.
- The editor asks only for what a person decides; app-stamped fields move to a
  separate, marked group.
- Rename the app to "Revel priority tracker".
- Adopt OpenSpec for this repository.

## Capabilities

### New Capabilities

- `ticket-tracking` — the ticket model, its field discipline, sprint columns,
  project membership, priority flags, in-browser editing, and export.

### Modified Capabilities

(none — this is the repository's first spec)

## Impact

Code: `schema.ts`, `store.ts`, `seed.ts`, `exporters.ts`, `TicketForm.tsx`,
`Sprints.tsx`, `Projects.tsx`, `Register.tsx`, `Triage.tsx`, `App.tsx`, tests.

Data: the localStorage key changes; saves from the previous shape fail
validation and reseed, so nothing half-loads.

Tooling: `openspec/` added at the repo root; a `.hermes/skills` directory is
generated for agent workflows.
