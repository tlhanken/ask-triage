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

### Decision 2: One full baseline plus deltas

Reverting needs to know a starting point. Keeping the oldest retained state whole
one time — about 7.4KB, or 4% of the current file — means a revert walks back from
the current state rather than replaying from the beginning of time, and a revert
that runs past the oldest change has an honest answer to give.

### Decision 3: A change record's shape

Per entry: `at`, `label`, `op` (all already present), plus `tickets` — the
before-state of only the tickets the change touched, keyed by id — and `settings`
only when settings changed. Written as structured JSON rather than an escaped
string, so the file reads as the change it was. Deliberately exclude ids the
change did not touch: that omission is the whole saving, and it must be testable.

### Decision 4: Convert on load, on every load path

One conversion function, called from all three entry points (localStorage,
the file endpoint, the file picker) — the project's existing rule, because a
migration that runs on one path presents as undefined values on the others.
Legacy full-state entries convert exactly: consecutive full states already contain
the information a delta needs, so nothing is invented. The oldest legacy entry
becomes the baseline.

### Decision 5: The pre-conversion file is not recoverable, and that is new risk

The register is untracked now, so once a converted file is saved the previous
shape is gone with no commit to restore it. See Open Questions.

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
- **Conversion running twice must be a no-op** → the conversion is keyed off the
  stored version, and asserted by a test for each shape.
- **History gets smaller but the file is still rewritten whole on every save** →
  a consequence of Decision 1, and acceptable at this size; it is why the file
  must be kept small in the first place.

## Migration Plan

1. Bump the stored version. The existing loader already refuses a save it cannot
   read, so an older build degrades to a clean refusal rather than a partial load.
2. Convert on load, in one function, called from every load path.
3. On the first save after conversion, the file is rewritten in the new shape.
4. Rollback: revert the code. The register then fails to load in the old build —
   which is why Open Question 1 exists and should be settled before implementing.

## Open Questions

1. **Should the first conversion keep a copy of the old file?** The register is
   untracked, so a bad conversion would be unrecoverable. Keeping
   `data/register.pre-delta.json` once, and never touching it again, is cheap
   insurance; it also leaves a stray file nothing manages. Needs a decision.
2. **Does the baseline count toward the cap of 25,** or is it held in addition? It
   changes what "25 entries" means in the bounded-growth scenario.
3. **Confirm Decision 1.** The `ADDED` requirement "stays one transportable file"
   is the decision, not a detail. If per-state files are actually wanted, that
   requirement is the one to overturn — and this document's reasoning is the case
   against.
