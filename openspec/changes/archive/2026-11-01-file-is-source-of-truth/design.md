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
- "Reload from file" replaces this tab's state with the file's, history and all.
- "Download my copy" saves this tab's register first.

The History tab's "Save to file" offers to overwrite deliberately. The user
then owns that choice. An overwrite bases itself on the file's current version
(a fresh HEAD), so it goes through the same check rather than around it.

### Why a reload is not a revertible entry

The proposal had the reload recorded so it could be reverted. Implementing it
showed that cannot be done honestly once history records changes rather than
states (`shrink-register-history`): history is one chain leading back from the
current register. This tab's register is on its own chain, not the file's, so
an entry for "before the reload" would have to sit on the file's chain and lead
back to a state that chain never passed through. Any revert past it would apply
the file's older changes on top of this tab's tickets.

So the reload takes the file whole, history included, and the banner puts
"Download my copy" first. The download is the record of this tab's copy.

## Saves are queued

Two saves in flight at once would race: both send the same version, the first
lands, and the second is refused as stale by its own tab. Saves are chained, and
each reads the version when it is sent, after the previous one has finished.
An unchanged register is not written again, so adopting the file on startup
does not write it straight back.

## A file this version cannot read

Startup does not autosave over it, since that would destroy something the user
may want. "Save to file" replaces it after a confirmation.

## A format change keeps the old file

When a write changes the register's stored `version`, the server copies the
file it is about to replace to `register.v<old>.<timestamp>.json` beside it and
never touches that copy again. The register is untracked, so this is the only
way back from a format change that went wrong. It applies at the server, so it
covers every write, the application's or not. Nothing manages those copies:
deleting them once the new format is trusted is the user's call.

## What stays

- The empty-write guard stays. It answers a different question: whether a
  write is empty, not whether it is stale.
- Browser storage is still written on every change. It is what keeps a static
  build working, and it covers the time between edits and an autosave.
- "Load from file" (the picker) is unchanged.
