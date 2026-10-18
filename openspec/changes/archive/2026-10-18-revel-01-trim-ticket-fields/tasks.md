# Tasks

## Model

- [x] Remove `notes`, `externalKey`, `expectedDurations` from the Ticket model
- [x] Rename `committedCycle` → `sprint`, `cycleLabel` → `currentSprint`,
      `commitTargetPerCycle` → `commitTargetPerSprint`
- [x] Seed the sprint columns as `v0.21` … `v0.25` with `v0.23` current
- [x] Add `externalLabel()` to derive the key from the link
- [x] Move slippage to a configured threshold (`slippageThreshold: 2`)

## Storage

- [x] Change the localStorage key and bump the store version
- [x] Validate the loaded shape, falling back to seed data on mismatch
- [x] Update the seed tickets to the trimmed model

## Interface

- [x] Editor asks only what a person decides; stamped fields grouped and marked
- [x] Sprint board, register and project views read `sprint`
- [x] Register derives the external link label
- [x] Rename the app to "Revel priority tracker" everywhere it is displayed

## Tooling

- [x] `git init` the repository and add a `.gitignore`
- [x] `openspec init` with the Hermes target
- [x] Register `.hermes/skills` in `skills.external_dirs`

## Verification

- [x] Typecheck passes (`tsc --noEmit`)
- [x] 41 tests pass, including a field-discipline test that pins the stored set
- [x] Production build succeeds
- [x] Sprint ordering verified numerically, not lexically
