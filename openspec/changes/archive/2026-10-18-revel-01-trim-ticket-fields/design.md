# Design — trimming the ticket model

## Context

The register exists to make triage fast, not to describe work exhaustively. Each
added field is a tax paid on every read and every edit, and the tax compounds:
fields invite values, values invite maintenance, and maintenance is what turned
the spreadsheet into a burden.

## Decisions

### Drop `notes`

Freeform fields collect material that belongs elsewhere and that nothing reads.
The observed alternative is that the information is either a real field (which
then earns its place) or it is noise. Removing it also removes the incentive to
write an essay instead of deciding.

### Derive the external key from the link

`externalKey` duplicated information already present in `externalUrl`. The
display label is a presentation concern, so it is computed on read
(`externalLabel`). This keeps the JIRA affordance (a short, legible key) with no
stored field and no chance of the two drifting apart.

### Collapse `expectedDurations` into the carryover threshold

Slippage was expressed twice: a per-ticket estimate of how many sprints it should
take, and a policy rule that an item may carry over at most twice before it needs
a decision. The policy already supersedes the estimate, so the estimate was
removed and SLIPPED now compares the carryover count against a single configured
threshold.

Trade-off accepted: a genuinely long item (three sprints) is flagged as slipped
at two carryovers. The consequence is a conversation, which is the intent — the
flag prompts a decision rather than silently passing.

### Rename `committedCycle` to `sprint`

The field holds a sprint, the interface calls it a sprint, and only the code
called it a cycle. Names that disagree with the domain vocabulary are a small,
constant tax.

## Consequences

- The model is 17 fields, down from 23.
- The editor asks 11 questions, with 4 correction-only fields marked separately.
- Existing saves are invalidated by design; the storage key changes and the
  model validates on load.

## Out of scope

- Drag-and-drop between sprint columns.
- Any backend, sync, or authentication.
- Ingesting the partner's JIRA.
