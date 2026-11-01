## Context

The durable register is written to `data/register.json`: one JSON file holding
tickets, decisions, settings, and the last 25 history entries. Measured today:

    194,840 bytes total
      6,292      the 14 tickets — 3.2%
    184,243      history — 94.6%, 25 entries averaging 7,370 bytes

A ticket averages 449 bytes, and each history entry is a full copy of every
ticket, so the same 14 tickets are stored 25 times.

Two causes, and only one of them matters:

- The entries are escaped JSON strings (`capture` runs `JSON.stringify` over
  `{tickets, settings}` and stores the result as a string). Re-encoding them
  structurally saves 5.1%. Real, but not the problem.
- Each entry is a full state rather than a change. That is the 94.6%.

The spec caused the second one: "Every change SHALL record the state it is about
to replace."

Constraints from the current design:

- The file is the durable record and is untracked, so there is no commit to fall
  back on. Storage decisions must be conservative.
- History is read by the History tab and by `revertTo`. On startup the browser's
  copy wins and the file is adopted only when the browser has no history and no
  decisions — so the file's history exists for the fresh-browser and
  another-machine cases.
- The store is written to localStorage as well as the file, and localStorage is
  small. That is the real reason for a cap.

## Goals / Non-Goals

**Goals:**

- Record changes, not states, so the history stops being N copies of the register.
- Keep the durable record as ONE file, so it stays transportable.
- Keep revert, the cap, and the "a revert is itself recorded" behaviour identical.
- Convert existing registers on load, on every load path, inventing nothing.

**Non-Goals:**

- Changing the history cap of 25, the UI, the decision log, or what is recorded.
- Adding a backend, a database, or a network service.
- Introspection tooling for older states (see Decision 1's alternative).
- Fixing the escaped-string encoding beyond what the new shape requires.

## Decisions

### Decision 1: Record reversible changes in one file, not a file per state

Chosen: each history entry carries the before-state of the tickets it touched
(plus settings when they changed), one full baseline entry is kept at the oldest
end, and everything stays in `data/register.json`.

Alternatives considered:

- **A unique file per state** (the shape this change was proposed as). Total bytes
  are unchanged — 25 files of 7.4KB is the same 184KB — so it solves the file's
  size only by moving the bytes elsewhere. It adds pruning, ordering, and an
  atomicity question the single file does not have: a crash between writing the
  register and writing its history file leaves the two disagreeing, with no
  ordering rule to resolve it. It also breaks the single-file export and import
  that `downloadJson` and the file picker depend on, which is the app's only way
  to move a register or hand it to someone.
- **History in localStorage only, file holds current state.** The smallest file by
  far, and closer to what an earlier comment claimed. Rejected because it makes
  the history die with the browser profile and never travel with a copied file —
  losing exactly the fresh-browser and another-machine cases the file's history
  exists for.
- **Keep full states, only de-escape them.** 5.1% smaller and still N copies of the
  register. Treats the symptom.

If browsing versions as separate files on disk is wanted later, that is a
deliberate EXPORT, and it can be added on top of this shape without changing what
is stored.

### Decision 2: No baseline — the current register is the starting point

The first draft kept one full copy at the oldest end of the history, as the
starting point for a revert. Working it through, that copy is never used:

- A revert starts from the register as it is NOW and undoes each later change,
  newest first. The current register is always complete, so it is the starting
  point, and it is the only one needed.
- Reverting "past the oldest change" is not something the history can be asked
  for. The oldest state it can reach is the one before its oldest entry, and the
  walk gets there exactly. A baseline would only be a second, redundant copy of
  that same state.
- Its other job, making a corrupt record fail rather than half-apply, is done by
  checking every record before any of them is applied (Risks below). A baseline
  does not help with that: the walk never reaches it before the corrupt record.

So there is no baseline, and Open Question 2 (does it count toward the cap?)
does not arise. The cap is 25 change records.

### Decision 3: A change record's shape

Per entry: `at`, `label`, `op` (all already present), plus `tickets` — the
before-state of only the tickets the change touched, keyed by id, with `null`
for a ticket the change created — `settings` only when settings changed, and
`order` (the ticket ids, in order) only when the change added, removed or
reordered tickets, so a restored ticket goes back where it was. Written as
structured JSON rather than an escaped string, so the file reads as the change
it was. Ids the change did not touch are left out: that omission is the whole
saving, and it is tested.

The record is computed by comparing the register before and after the change,
not by each mutation declaring what it touched. A mutation that forgot one
ticket would otherwise record a change that cannot be undone, and nothing
would say so.

### Decision 4: No conversion of the old format

The app is not in use yet, so there are no full-copy registers worth
converting. The stored version moves from 3 to 4, and the existing safeguard
refuses a version-3 register whole. The server keeps the replaced file when a
save changes the format, so even a refused register is not lost.

## Risks / Trade-offs

- **A corrupt change record makes a revert wrong rather than absent** → keep the
  baseline, apply inverse records in order, and have a revert that cannot be
  computed report a failure instead of applying part of one.
- **A save is not loaded by an older build** → this is why the proposal marks the
  shape BREAKING, and why the existing "an incompatible save is not loaded
  partially" requirement matters: the failure must be a clean refusal.
- **Ordering is now load-bearing.** Full states could be read in any order; deltas
  cannot. → The array order is the order, exactly as the sprint array already is;
  no separate ordering field.
- **History gets smaller but the file is still rewritten whole on every save** →
  a consequence of Decision 1, and acceptable at this size; it is why the file
  must be kept small in the first place.

## Migration Plan

1. Bump the stored version to 4. The existing loader refuses a save it cannot
   read, so an older register degrades to a clean refusal, not a partial load.
2. No conversion runs. The first save in the new format replaces a version-3
   file, and the server keeps the old file beside it.
3. Rollback: revert the code, and restore the kept file if one was written.

## Resolved questions

1. **Keep a copy of the old file?** Yes, generalised: the server keeps the
   replaced file whenever a save changes the format version (see
   `file-is-source-of-truth`).
2. **Does the baseline count toward the cap?** There is no baseline
   (Decision 2).
3. **One file?** Confirmed. The `ADDED` requirement stands.

## Measured

On the seed register (14 tickets) with 25 single-ticket edits:

    full copies (old)   ~190 KB of history, ~201 KB file
    change records      ~19 KB of history, ~30 KB file
