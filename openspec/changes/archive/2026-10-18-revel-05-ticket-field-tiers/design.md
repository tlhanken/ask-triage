# Design — three tiers instead of one list

## Why tiers rather than a shorter list

The previous pass trimmed the field count, which helped but missed the actual
problem: a trimmed flat list still treats a hand-entered judgement and an
app-written timestamp as the same kind of thing, so the editor asks for both.

Three tiers answer a different question — *who is this field for?*

- **Core** exists to describe one request in the words a person already has.
- **Optional** is real and used, but forcing it would make every entry slower.
- **Background metadata** is written by the app or the triage loop. Asking a
  person to type it is the error the tiers exist to prevent.

`state` and `sprint` are worth noting: they are prominent on the board, but they
are set by the triage loop and by dragging, never typed into a form.

## Estimate in sprints, not t-shirt sizes

`size` was the weakest field in the audit: a judgement on every ticket that moved
a score by ten points and nothing else. It is replaced by an estimate in sprints,
which is the same one-click judgement but carries a second, more useful meaning —
it can be compared against a due date. A three-sprint ticket due in ten days is
now visibly impossible rather than merely large, and the board says so.

The quick-win score term is preserved by mapping estimate 1/2/3 onto the same
weighting, so existing scores do not move for equivalent tickets.

## Notes comes back

It was cut earlier as the classic freeform graveyard, and for a model with
nowhere else for prose that was wrong. Two things settled it: it was asked about
twice, which is the signal that it is a real need rather than an ornamental one,
and there is genuinely no other home for "the auditor asked for this last review"
— that is not a summary (which is user-facing), not a decision reason (which
belongs to a triage action) and not a release date.

The mitigation for the original objection is placement: notes lives in the
optional tier, collapsed, so it can never become a step in entering a ticket.

## What the four removals cost

Honest accounting, because each drops information:

- `owner` — who is responsible. `projects` and `stakeholders` do not replace it.
- `ownerType` — the partner-versus-team distinction.
- `nextAction` — the answer to "any update?". The decision log still carries a
  reason per triage action, so the weekly digest loses nothing, but the ticket no
  longer states what happens next.
- `size` — replaced, not lost.

If responsibility needs to come back, `owner` is the one to restore: it is a
single free-text field and nothing else in the model covers it.

## Migration

Tickets are migrated on load rather than reseeded: dropped keys are deleted, a
missing `estimate` defaults to 2 and a missing `notes` to empty. The alternative —
invalidating the save and starting from seed — would have thrown away the history
and every recorded decision, which is exactly what the version layer exists to
prevent.
