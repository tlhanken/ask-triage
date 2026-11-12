## Why

The durable register is 194KB, and 94.6% of it is history: 25 entries, each a full
copy of a 14-ticket register. The current state occupies 3.2% of the file that
exists to hold it, and every save rewrites all of it.

It grew this way by instruction. The spec says a change records "the state it is
about to replace", so the history holds 25 duplicate copies of the same tickets
instead of 25 records of what changed. The fix is to record the change.

## What Changes

- A recorded change carries what is needed to reverse it, not a further full copy
  of the register. **BREAKING** for the on-disk shape of `history`: entries become
  reversible change records, so a file saved by this version is not loadable by an
  earlier one. The existing safeguard applies — an incompatible save is not loaded
  partially.
- The register stays a single file. History gets smaller; the number of files does
  not change, so a register is still exported, downloaded and re-imported as a
  unit.
- No full copy is kept anywhere in the history. A revert starts from the
  current register and steps back, so the current register is the only
  starting point it needs. A damaged record fails the revert rather than
  applying part of it.
- Registers in the full-copy format are not converted: the app is not in use
  yet, so a conversion would be code with nothing to convert. They are refused
  whole by the existing safeguard, and the server keeps the replaced file when
  a save changes the format (`file-is-source-of-truth`).
- Revert, the "a revert is itself recorded" rule, the history cap, the decision
  log, and the UI are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ticket-tracking`: version history changes from recording the state a change
  replaces to recording what reverses it, and the durable register is required to
  stay a single transportable file.

## Impact

- `src/store.ts` — `capture`, `pushHistory`, `revertTo`, `HISTORY_CAP`, `serialize`
- `src/App.tsx` — revert wiring, which now reports a revert that fails
- `src/app.test.tsx`, `src/schema.test.ts` — history and revert coverage
- `README.md` — the "Not done yet" entry this closes
- `data/register.json` — a file in the old format is refused, and kept by the
  server when the first save in the new format replaces it
