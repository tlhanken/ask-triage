# The file is the source of truth

## Why

Whenever the dev server is running, `data/register.json` is the register that
matters. Today the browser wins anyway.

On startup the file is adopted only if the browser holds no state of its own.
After that, every change is autosaved over the file 600ms later, and nothing
checks what it overwrites. The last writer wins, silently:

- **Two tabs.** Edit in tab A, then touch anything in an older tab B. B writes
  its stale register over A's work. This is the likely way to lose data.
- **Two machines.** The server binds `0.0.0.0` so the tailnet can reach it. A
  second browser with old state overwrites the file the moment it is used.
- **Startup race.** File mode is switched on before the GET resolves. If the GET
  takes longer than 600ms, a fresh browser's seed data is written over the real
  file, and the empty-write guard allows it.

The guard only catches writes with no tickets. Whether a write is stale is a
separate question, and today nothing checks it.

## What Changes

- With a server present, startup **always loads the file**. Saving only begins
  after that load. Browser storage becomes a cache, used when there is no server
  or the server cannot be reached.
- Every save says which version of the file it was based on. A GET returns an
  `ETag` (a hash of the file). A POST sends it back as `If-Match`. The server
  refuses the write with **409** if the file has changed since.
- On a refused write the app **stops autosaving** and says so: another tab or
  machine changed the register. It offers two actions: reload the file, or
  download this tab's copy first, so the refusal never loses anything.
- If there is no file yet, the browser's state still establishes it, as today.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ticket-tracking`: "Local-first persistence" changes its adoption rule, and a
  new requirement refuses stale writes.

## Impact

Code: `server/localData.ts` (ETag on GET, If-Match on POST, 409),
`persist.ts` (carry the ETag), `App.tsx` (load before saving, stop on
conflict), and tests for each.

Data: none. No field is added to the register; the version is a hash of the
file itself.

Out of scope: merging two divergent registers. A refusal plus a download is
enough for a register one person runs.
