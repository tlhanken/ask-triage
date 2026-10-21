# Split tickets into three field tiers

## Why

A flat list of eighteen fields cannot tell the difference between "this is what
the ticket is about" and "this is a timestamp the app happened to write". The
result is an editor that asks for everything, which makes entering a ticket feel
like filling in a form rather than recording a request.

## What Changes

- **BREAKING** The ticket model is split into three explicit tiers: **core**
  (asked for, always), **optional** (one click away, never required) and
  **background metadata** (set by the app or the loop, shown read-only).
- **BREAKING** Removed: `owner`, `ownerType`, `size`, `nextAction`.
- Added `estimate` — the expected completion length, in sprints — replacing
  `size`, and used in place of it to score a quick win.
- Added back `notes`, in the optional tier. Freeform context that has nowhere
  else to live.
- `type` and `stakeholders` move to the optional tier: available and still used
  by the score and the digest, but never required.
- A ticket is flagged when its estimate cannot finish before its due date.
- Existing saves are migrated in place: `size` becomes an `estimate`, dropped
  fields are removed, new fields are defaulted. No tickets or history are lost.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking` — the field-discipline requirement is restated in terms of
  three tiers, and a new requirement defines the tiers themselves.

## Impact

Code: `schema.ts` (tiers, `estimate`, `overEstimate`), `store.ts` (blank ticket,
migration), `seed.ts`, `exporters.ts` (CSV columns), `TicketForm.tsx` (three
tiers, two collapsed), `Triage.tsx`, `Register.tsx`, `styles.css`, tests.

Data: migrated in place. The score is unchanged for equivalent tickets, because
`estimate` 1/2/3 carries the same quick-win weighting that `S`/`M`/`L` did.
