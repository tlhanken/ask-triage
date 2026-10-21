# Design — release dates, freeze, and where the dates live

## On the release, not on the ticket

The obvious implementation would be two more ticket fields. That would be wrong
twice over: the same freeze date would be copied across every ticket in a
release (two hundred copies of one value, all of which can disagree), and it
would drag a ticket model that was just trimmed back toward bloat.

Dates belong to the release. A release is two values; a ticket merely points at
one by name. This is why the ticket model is unchanged by this change.

## Where "slipped in after freeze" comes from

Reporting scope after freeze needs to know *when* a ticket was assigned, and
there is no `assignedAt` field — deliberately, since it would exist only for this
one question.

Instead, history entries gained an optional structured `op` describing the move
(`{ kind: "move", ticketId, sprint }`), alongside the human label they already
carried. "What arrived after freeze" is then a query over recorded moves:

    history where op.sprint == release
            and op happened after release.freeze

Two consequences worth stating plainly. It costs no ticket field. And it is
bounded by the history cap (25), so it answers "since the freeze" only as far
back as the history reaches — which is the window this question is actually asked
in. If a permanent audit record is ever needed, that is a different feature with
a different storage decision, not something to smuggle in here.

## Warn, do not block

The requirement was "possible, but warn". Blocking would make the board lie about
what is actually in a release: work does get added late, and a tool that refuses
to record it just moves the truth into someone's head. So the move lands, a
notice names the freeze date and how long ago it was, and the column carries a
count. The information is available at the moment of the decision and afterwards.

## Choosing by date rather than by name

The previous optimizer compared version names against the current release. With
real dates that heuristic is unnecessary and worse: a release is eligible if it
has not shipped and has not frozen, and it is filled in release-date order. The
due-date rule — prefer the earliest release shipping on or before the due date —
is the reason the dates were wanted in the first place, and it is stated as a
preference rather than a constraint, so a late ticket still lands somewhere with
the conflict marked instead of vanishing from the proposal.

## Migration rather than reseeding

Releases used to be plain strings. `load()` upgrades them in place to
`{ name, freeze: null, release: null }`, so an existing register keeps its
tickets and its history. A release with no dates is simply never eligible for
automatic placement and never reported as frozen — absent dates degrade quietly
rather than breaking the board.
