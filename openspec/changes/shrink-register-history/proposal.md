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
- The retained history keeps one full baseline so that reverting past the oldest
  recorded change still works, and so a corrupt record degrades to a failed revert
  rather than a partial one.
- Existing registers that hold full-copy history are converted on load, on every
  load path, without inventing data.
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
- `src/App.tsx` — both load paths, which must run the conversion
- `src/app.test.tsx`, `src/schema.test.ts` — history and revert coverage
- `README.md` — the "Not done yet" entry this closes
- `data/register.json` — the existing 195KB file, converted on first load
