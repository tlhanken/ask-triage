## 1. Change record shape

- [x] 1.1 Replace the `Snapshot` type with a change record: `at`, `label`, `op`,
      plus the before-state of only the tickets the change touched, and `settings`
      only when settings changed.
- [x] 1.2 Stop double-encoding: write the before-state as structured JSON rather
      than the `JSON.stringify` string `capture` produces today.
- [x] 1.3 Record which tickets a mutation touches, so the record can omit the rest.
      Done by comparing before and after, so no caller has to declare its ids.
- [x] 1.4 ~~Keep one full baseline entry~~ Dropped: the current register is the
      starting point for every revert (design, Decision 2).
- [x] 1.5 Update the `HISTORY_CAP` comment: the cap is still driven by
      localStorage's size, and now also bounds the durable file.

## 2. Revert

- [x] 2.1 Rewrite `revertTo` to walk back from the current state, applying inverse
      records in array order, instead of loading a stored full state.
- [x] 2.2 Report a revert to the oldest retained entry as reaching the oldest
      state the history holds.
- [x] 2.3 Report a revert that cannot be computed as a failure rather than
      applying part of one.
- [x] 2.4 Keep the existing behaviour that a revert is itself recorded and can be
      undone, and that it does not rewrite the decision log.
- [x] 2.5 Confirm deletion is still recoverable, its id still not reused, and the
      ticket restored in its original place.

## 3. Migration

- [x] 3.1 ~~Conversion function~~ Not written: the app is not in use, so the old
      format is refused whole instead (design, Decision 4).
- [x] 3.2 Bump the stored version so every load path refuses the old format.
- [x] 3.3 Keep a copy of the replaced file: done at the server for every format
      change (`file-is-source-of-truth`).
- [x] 3.4 Test that a version-3 register is refused whole.

## 4. Verification

- [x] 4.1 Assert the new scenario: at the cap, no entry is a full copy of the
      register, and history size does not grow with the ticket count.
- [x] 4.2 Measure before and after (design, Measured).
- [x] 4.3 Run `npm run typecheck`, `npm test`, `npm run build` and
      `openspec validate`.
- [x] 4.4 Update `README.md`: remove the "Not done yet" entry this closes.
- [x] 4.5 Confirm the register still loads, history and all, from the file alone.
