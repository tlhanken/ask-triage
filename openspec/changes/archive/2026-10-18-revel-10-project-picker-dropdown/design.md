# Design — bounded by default

## Why a cap and a count

The picker's job is to let somebody name a project they already have in mind, not
to browse. Rendering every match stops being scannable long before it stops being
fast, so the list is capped at 50 and says "showing 50 of 213 matches — keep
typing to narrow". The cap narrows the view without hiding that more exists: a
silent truncation would be the same failure as an empty proposal with no reason.

## Prefix before substring

With a few hundred projects, substring matching alone buries the obvious answer.
Typing `plat` should offer `Platform` before `WebPlatform`, so prefix matches rank
first and ties keep the list's own order, which is the author's arrangement
showing through rather than an accident of the sort.

## Nothing pre-selected

The highlight starts at -1 rather than 0, so pressing enter without choosing does
nothing. Pre-selecting the first row makes enter a coin flip: it silently attaches
whatever happens to sort first.

## Overlaying, not pushing

The dropdown is absolutely positioned. A list that grows in flow moves every field
below it, so the form jumps while you type — which at 500 projects is the
difference between usable and not.

## One pass, not one per project

The project view computed its per-project counts by scanning every ticket once per
project: hundreds of full scans on every render as the list grows. It is now a
single pass building a tally, and it skips any project that has left the list
rather than inventing a row for it.

Worth noting what is NOT fixed here: the project view still renders one chip
button per project in its toolbar. The count fix and the picker are the parts that
were asked for; converting that toolbar is a visible interaction change and is
left as a separate decision.
