# Tasks

## Model

- [x] `CORE_FIELDS`, `OPTIONAL_FIELDS`, `BACKGROUND_FIELDS` declared in one place
- [x] Ticket regrouped into the three tiers
- [x] `estimate` (1 / 2 / 3+ sprints) replaces `size`
- [x] `notes` restored, in the optional tier
- [x] Removed: `owner`, `ownerType`, `size`, `nextAction`
- [x] `derive` reports `overEstimate` when the estimate cannot beat the due date

## Store

- [x] Blank ticket matches the tiers exactly
- [x] Migration on load: drop removed keys, default `estimate` and `notes`
- [x] `estimate` carries the quick-win score term that `size` used to

## Interface

- [x] Editor: core fields in the open form, optional in a collapsed group, background read-only
- [x] Background group offers recording a carryover as an action, not a field
- [x] Triage card shows the estimate and a "won't fit before due" badge, and no longer shows owner or next-action
- [x] Register search covers notes in place of owner

## Verification

- [x] Typecheck passes
- [x] 75 tests pass, including: the stored field set equals the three tiers
      exactly, the tiers do not overlap, the four removed fields are absent,
      scores are unchanged for equivalent tickets, and the not-fitting flag
- [x] Production build succeeds

## Deliberately not done

- No `assignedAt`, no per-ticket release dates, no audit trail beyond history
- `owner` is not replaced by anything; restoring it is a separate decision
