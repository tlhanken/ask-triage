## 1. Change record shape

- [ ] 1.1 Replace the `Snapshot` type with a change record: `at`, `label`, `op`,
      plus the before-state of only the tickets the change touched, and `settings`
      only when settings changed.
- [ ] 1.2 Stop double-encoding: write the before-state as structured JSON rather
      than the `JSON.stringify` string `capture` produces today.
- [ ] 1.3 Record which tickets a mutation touches, so the record can omit the rest.
      Check every caller of `act`/`pushHistory` for the ticket ids involved.
- [ ] 1.4 Keep one full baseline entry at the oldest end of the history; settle
      Open Question 2 first, since it decides whether the baseline counts toward
      `HISTORY_CAP`.
- [ ] 1.5 Update the `HISTORY_CAP` comment: the cap is still driven by
      localStorage's size, and now also bounds the durable file.

## 2. Revert

- [ ] 2.1 Rewrite `revertTo` to walk back from the current state, applying inverse
      records in array order, instead of loading a stored full state.
- [ ] 2.2 Report a revert that reaches the oldest retained state as reaching the
      end of the history, per the new scenario.
- [ ] 2.3 Report a revert that cannot be computed as a failure rather than
      applying part of one.
- [ ] 2.4 Keep the existing behaviour that a revert is itself recorded and can be
      undone, and that it does not rewrite the decision log.
- [ ] 2.5 Confirm deletion is still recoverable and its id still not reused.

## 3. Migration

- [ ] 3.1 Write one conversion function from legacy full-state history to
      baseline-plus-changes, keyed off the stored version.
- [ ] 3.2 Call it from every load path: localStorage, the file endpoint, and the
      file picker. Missing one presents as undefined values, not as an error.
- [ ] 3.3 Settle Open Question 1 (keep a copy of the pre-conversion file) and
      implement the answer.
- [ ] 3.4 Test each shape: legacy, already converted, and unreadable — plus that
      re-running the conversion changes nothing.
- [ ] 3.5 Confirm an incompatible save is still refused cleanly and not loaded
      partially.

## 4. Verification

- [ ] 4.1 Assert the new scenario: at the cap, the entries are not each a full copy
      of the register, and history size does not grow with the ticket count.
- [ ] 4.2 Measure the real file before and after and record both numbers; the
      before is 194,840 bytes, 94.6% history.
- [ ] 4.3 Run `npm run typecheck`, `npm test`, `npm run build` and
      `openspec validate --all --strict`.
- [ ] 4.4 Update `README.md`: remove the "Not done yet" entry this closes, and
      update the data-lives-here section if the shape it describes has changed.
- [ ] 4.5 Confirm the register still loads in a fresh browser from the file alone,
      which is the case the file's history exists for.
