# Tasks

## Store

- [x] `OptimizeResult` — moves plus eligible / full / undated / skipped / candidates / unplaced
- [x] Releases with no date are eligible, considered after dated releases
- [x] Dated ticket placed into an undated release is flagged
- [x] `explainPlan` renders the reason from the result, never from a guess
- [x] `fillReleaseDates` — two-week cadence, oldest version first, no-op when nothing is missing

## Interface

- [x] The proposal panel shows the explanation when empty and when limited
- [x] The undated-release offer appears only when releases lack dates
- [x] Applying uses `plan.moves`; the fill action is revertible

## Verification

- [x] Regression test for the reported case: releases with no dates still produce
      a proposal, and the uncertainty is flagged
- [x] Regression test: an empty proposal carries a reason, for both the
      all-shipped and the nothing-unscheduled cases
- [x] Tests for the cadence fill, including oldest-version-first ordering and the
      no-op case
- [x] 80 tests pass, typecheck and build clean

## Not done

- No automatic date invention on load or migrate; it stays an explicit action
- Not changing what auto-optimize is allowed to move — only what it reports
