# Design — a controlled list, not a fixed one

## Why the list had to become data

`ProjectId` was a union of five string literals, so the compiler knew every
project. That is a nice property and it is exactly what made the list
uneditable — adding one meant a code change, a build, and a deploy.

The union bought type safety on names that a person types. It is now a plain
string. That is the real trade in this change, and it is worth stating plainly:
the list is still controlled, but it is controlled at runtime rather than by the
compiler.

## Explicit creation, not incidental

The discipline from the earlier picker work was "no project is created by
typing", and it still holds: typing a name that matches nothing creates nothing.
What changes is that there is now a button, appearing only in that state, that
says "add it to the list". A deliberate action on a name that already exists in
front of you is not the same as a typo silently becoming a project.

## Removal detaches, and says how many

Deleting a project that seven tickets carry has three possible meanings, and only
one of them is honest:

- refuse while in use — turns cleanup into a chore, and the tool nags
- leave the name on the tickets — those tickets leave every project view, so they
  disappear from the only place that shows them
- detach from the tickets, having said how many — the tickets survive, visible,
  minus one label

The third is what this does, and the confirmation names the count first, because
the consequence should be known before the click rather than discovered after.
Leaving the name on the tickets is the option that looks harmless and is the only
one that loses data.

## Orphaning in the other direction

The inverse case matters too: a ticket may name a project the list does not carry
— from a save made before the list existed, or from a project removed while the
ticket sat in a stale browser. Migration unions those names back in. A ticket
referenced by no project view is a ticket nobody sees, which is a worse outcome
than a project reappearing.

## What was kept

The project view's chip switcher is unchanged. Replacing it with a picker was
recommended earlier and is still worth doing at a few hundred projects, but it
changes a one-click interaction on a list of five, and building per-project
removal onto that toolbar did not require touching it. The manage panel is
separate and collapsible, with its own filter capped the same way the picker is.
