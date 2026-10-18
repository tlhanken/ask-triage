# Tasks

## Model

- [x] `Sprint` becomes `{ name, freeze, release }`
- [x] `defaultSprints()` seeds a dated plan (v0.23 current: freezes soon, ships in two weeks)
- [x] `isFrozen`, `hasShipped`, `daysToRelease`, `sprintNames`, `findSprint` helpers
- [x] Existing saves migrate release names to releases with empty dates

## Store

- [x] `addSprint` creates a release; `updateSprint` sets its dates
- [x] `removeSprint` / `shiftSprint` operate on release names
- [x] History entries carry an optional structured `op` for moves
- [x] `slippedIn` derives scope after freeze from recorded moves
- [x] Optimizer: skip shipped and frozen, fill by release date, prefer shipping on or before the due date, flag conflicts

## Interface

- [x] Column head shows freeze date, release date, days remaining, frozen/shipped state, post-freeze count
- [x] Clicking a release name opens `SprintForm` to edit or delete it
- [x] A freeze date after the release date is rejected in the form
- [x] Assigning into a frozen release warns and is allowed
- [x] Optimizer proposal shows the conflict badge when nothing ships in time

## Verification

- [x] Typecheck passes
- [x] 73 tests pass: release dates present, freeze boundary, optimizer skipping
      frozen and shipped releases, due-date preference, conflict marking,
      slip derivation, migration behaviour, dates editing in the UI, and the
      warn-but-allow freeze flow end to end
- [x] Production build succeeds

## Deliberately not done

- No ticket fields were added: dates live on the release, and post-freeze
  detection is derived from history
- No permanent audit trail beyond the history cap
