# Design — board interaction, history, persistence

## A file, not a database

The question worth answering properly rather than by default.

A database earns its place when there are **concurrent writers**, **more rows
than fit comfortably in memory**, **partial updates of large records**, or
**readers other than the app itself**. This register has none of those: one
person, hundreds of rows, whole-document saves.

What it does have is a need to **go back**. Version history is the requirement,
and a single JSON file satisfies it far better than a database does:

- `git diff` on JSON is readable and reviewable; a binary database is not.
- Reverting a bad day is `git checkout`, which already exists and is already
  understood.
- No migrations, no server process, no schema drift between machines.
- The file is portable and inspectable; a database file is a blob.

So: one JSON file, written through a small endpoint on the dev/preview server,
tracked by git. The browser cannot shell out to git, so committing stays a
deliberate human action rather than something the app does behind your back —
which is the right shape for version control anyway.

If it ever needs concurrent writers or a shared view over a network, that is the
signal to revisit (server + database, or a hosted product), and it should be a
deliberate decision at that point rather than a pre-paid one now.

## Why two persistence layers instead of one

`localStorage` is instant and always available, but it is invisible to git — it
lives inside a browser profile. The file is what git can see, but it needs a
server or a permission prompt. Keeping both means the app never loses an edit to
a failed write, and the durable copy exists where version control can reach it.

Rules chosen deliberately: a browser that already holds state is **not**
overwritten by the file on load, and a browser with no state of its own **adopts**
the file. That makes the file the shared truth without risking a clobber of
unsaved local work.

## Why the optimizer is conservative

Auto-optimize only touches tickets with no release. A full repack would be
"better" by some measure and would also discard every judgement the owner has
already made — the fastest way to make an automatic feature hated. Proposing
placement for the unplaced is useful, reversible, and cannot damage the board.
Ordering is dated-work-first, then draft score; capacity is the configured
commit target; releases that have already shipped are never proposed.

## Why drag *and* the selector

Drag is the fast pointer path. The selector stays because dragging requires a
pointer, and a board whose only input method is a mouse gesture is not
operable by everyone. Both dispatch the same store transition, so they cannot
disagree.

## Why dropping works without `dataTransfer`

The drop handler reads the dragged id from component state first and falls back
to `dataTransfer`. That is more robust across browsers, and it has a second
benefit: `dataTransfer` is not implemented in the headless DOM used for tests, so
state-first is what makes drag-and-drop verifiable rather than hopeful.

## Why revert does not rewrite the decision log

The decision log is an audit trail: it records what was decided, at the time, by
whom. Rewriting it after the fact would destroy exactly the property that makes
it worth keeping. Reverting therefore restores tickets and settings, and the
history holds the record that a revert happened.

## Consequences

- `store.ts` gains a history array; saves predating it are defaulted, not
  invalidated, so no data is lost on upgrade.
- Snapshots are full copies of tickets and settings. At hundreds of tickets this
  is a few hundred kilobytes; the cap of 25 keeps it well inside browser storage.
  A diff-based history would be smaller and considerably more error-prone — not a
  trade worth making at this size.
