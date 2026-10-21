# Design: closing the dead ends

## Reset keeps the history and the log

Reset could have been deleted outright. It stays for demos and for trying the
app, but it no longer gets its own rules. It goes through `withHistory` like
every other change, so it is recorded and can be reverted. It returns the
current history unchanged instead of the fresh store's empty one. Revert
restores tickets and settings only, so the decision log has to survive the reset
on its own. The demo tickets get ids from `nextTicketId` onward. That keeps ids
from being reused, and it means no old decision (an undo snapshot, a revisit
date) attaches to a demo ticket that happens to share its id.

## Append-only beats tidy

`deleteTicket` dropped a ticket's decisions to keep the log tidy. But the log is
also where a deferral's revisit date lives, and revert never rewrites the log.
So tidiness turned a recoverable delete into a lost deferral. A decision about a
ticket that has since been deleted is still a true record of what was decided.

## Refusing before reading

The endpoint is a Vite middleware, and Vite restricts CORS to localhost origins.
But a "simple" request needs no preflight, so the browser sends it from any
page and the CORS rules never come into play. Requiring `application/json`
makes the browser ask first. Checking `Origin` against `Host` catches the rest.
`Origin` is absent on some same-origin requests, so a missing one is allowed.
Comparing against `Host` rather than a fixed list keeps tailnet access working.

## One way in

`readStore(raw)` returns a `Store` or `null`. The adoption rule (never adopt an
empty file, and only adopt into a browser with no history or decisions of its
own) stays at the call site. That rule is policy, not parsing, and the
file-is-source-of-truth change replaces it.

## Dates

Storage stays UTC ISO, which is unambiguous. The bug was only ever in reading
it: slicing the first ten characters of a UTC string gives the UTC date.
`localStamp()` and `iso(new Date(at))` give the local one. `addDays()` uses the
`Date` constructor's day overflow instead of milliseconds. The suite pins
`TZ=America/Los_Angeles` because the bug cannot appear in UTC, which is where
CI runs.
