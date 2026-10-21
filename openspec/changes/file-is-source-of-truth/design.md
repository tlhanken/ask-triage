# Design: one copy wins, and a stale copy is told so

## Version by hash, not by field

The version a save was based on is the SHA-256 of the file bytes the client
last saw. The server sends it as `ETag` on GET and on every successful POST.
The client sends it back as `If-Match`. Using a hash means:

- No `revision` field in the register, and nothing to migrate.
- A hand edit to the file, or a restored backup, changes the version too. A
  counter would miss both.
- Plain HTTP semantics: a refused write is a 409 and the reason is in the body,
  the same shape the empty-write guard already uses.

A POST with no `If-Match` is accepted only when no file exists (to establish
it). That keeps a plain `curl` from bypassing the check.

## Load, then save

The startup race comes from switching on file mode before the load. In the
new order: HEAD (is there a server?), then GET (adopt the file and keep its
ETag), and only then turn on autosave. Until then, edits go to browser storage
only. Removing the 600ms window is a side effect of this order, not a separate
fix.

## On conflict, stop

Retrying or merging automatically would decide for the user which change wins,
which is the exact problem being fixed. So after a 409:

- Autosave turns off.
- A banner says what happened.
- "Reload from file" replaces this tab's state, and is recorded so it can be
  reverted.
- "Download my copy" saves this tab's register first.

The History tab's "Save to file" offers to overwrite deliberately. The user
then owns that choice.

## What stays

- The empty-write guard stays. It answers a different question: whether a
  write is empty, not whether it is stale.
- Browser storage is still written on every change. It is what keeps a static
  build working, and it covers the time between edits and an autosave.
- "Load from file" (the picker) is unchanged.
