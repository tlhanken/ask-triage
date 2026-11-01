# Design: plan-workflow

The decisions below were settled with Trevor on 2026-10-20. Open questions are
listed at the end.

## One page, three queues

Triage, Review and Sprints each walk a set of tickets. What differs is which
tickets (the queue) and what you can do to each (the verbs). So the page is
built from queue + verbs:

    step        queue                                         verbs
    Fill out    open tickets that are not ready, plus          edit fields inline,
                deferred/blocked tickets back on revisit       decline, defer, block
    Schedule    ready tickets with no release                  drag, auto-optimize
    Check       releases with risks; shipped releases          edit; Done / carry
                with undecided tickets                         over / backlog

Review raised two kinds of alert, and they map onto the steps. "Missing data"
is Fill out; "going wrong" is Check. They were always two stages, so the merge
removes a screen without losing anything Review showed.

Stepping through a queue still changes nothing. Only an explicit key or button
writes, which keeps the Review sweep's read-only promise.

Shortcuts are reassigned once for the whole page. `j`/`k` step and `]` jumps to
the next ticket with an alert. The decision keys (`x` decline, `d` defer, `b`
block) only work in Fill out. This ends the `f` collision.

## Ready, and the nudges

A ticket is ready when auto-optimize can place it:

    isReady = priority set, type set, estimate set,
              and a due date or an explicit "no hard date"

The type is in the gate because per-team capacity, added later, will need it to
stop one team (Driver, say) being overloaded in a sprint.

Project, summary and stakeholders are nudges. The card shows them under "would
still help", using the audit's existing text about why each matters. The header
counts them. They never hold a ticket in Fill out.

Accept stops being its own key. Finishing the required fields is accepting the
ticket, and it moves to Schedule.

## Blank until chosen

The estimate, priority, type and due date start unset. A due date can be unset
(not answered yet), a date, or "no hard date" (`dueDate: null` plus
`noHardDate: true`, or a sentinel; the representation is decided in the
specs). The same rule applies to close-out, where nothing starts pre-selected.
A default never counts as a decision.

## Spans: the release it ships in

A ticket stores one release: the one it **ships in**. The releases it spans are
derived from that release and the estimate, counting back through releases in
ship-date order. This is not the board's display order. Undated releases fall
back to version order, as auto-optimize already does.

The ship release is stored, not the start release, because of what has to stay
fixed when things change:

- **The estimate grows.** The ship release holds, and the start moves earlier.
  Your promise to stakeholders stands, and the cost shows up (possibly as
  "starts too late"). If the start were stored instead, the ship release would
  move later and nobody would be told.
- **Close-out.** "Carry over" means one thing: the ship release moves on by
  one, and the carry-over counter goes up.
- **The due-date check** becomes one comparison: does the ship release ship by
  the due date? The old `estimate × sprintLengthDays` arithmetic goes away.
- **Freeze** applies only to the release a ticket ships in. A freeze is about
  what ships, not about what is being worked on.

Load: a ticket costs 1 unit in each unshipped release it spans. Capacity per
release is unchanged. This fixes the double count where a 2-sprint ticket cost
2 units in one release, then 2 more after carrying over.

Auto-optimize: for an estimate of N, it looks for the earliest ship release
that ships by the due date, is not frozen, and whose N spanned releases are all
unshipped with 1 unit free in each. That is why it can never propose shipping a
3-sprint ticket in the current release.

"Starts too late" is a risk in Check. It is reported, not blocked, like scope
after freeze.

## Close-out

A release has shipped once its ship date arrives. Its open tickets (the ones
that ship in it) appear in Check. Each gets an explicit choice:

- **Done.** The ticket closes and records its closed date.
- **Carry over.** The ship release moves to the next one. The carry-over
  counter goes up, and SLIPPED fires at its existing threshold.
- **Back to backlog.** The release is cleared, and the ticket returns to
  Schedule.

Applying the choices is one revertible action. Undecided tickets stay in Check.
This replaces the editor's manual "record a carryover" button.

## Lifecycle after the change

    New → (filled out) ready → scheduled → (ship release closes) Done
                                         ↘ carry over (same ticket, next release)
         Deferred / Blocked → back on the revisit day
         Declined (Won't Do) — closed

"In Progress" is not a state. Where a label helps, it is derived: the ticket is
"being worked on" when its span has started.

## Migration

- `estimate` stays numeric. The UI changes from 1/2/3+ to a number input. Seed
  and blank tickets get `null`.
- `"In Progress"` becomes `"Committed"`.
- `settings.currentSprint` is dropped. Anything that read it uses the derived
  current release.
- Existing estimates of 2 were never chosen by anyone; every ticket in the
  live register has one. Option: clear them so the tickets land in Fill out.
  Decide this in the specs.

## Resolved questions (2026-11-01)

1. **How is "no hard date" stored?** A `noHardDate` flag beside `dueDate`.
   A sentinel string in `dueDate` would have to be excluded from every date
   comparison, and one missed comparison parses it as a date. Setting a date
   clears the flag, so the two never disagree.
2. **Undo-last-decision?** Dropped. History revert is the one undo, so the
   decision log no longer carries a `prev` copy of the ticket for it.
3. **Never-chosen estimates?** Trevor: clear all of them. The app is not in use
   yet, so this is done in the seed rather than by a migration: every seed
   ticket starts with no estimate, and so starts in Fill out.

## Decisions made while specifying

- **No migration code.** The stored version moves to 5 and older registers are
  refused whole, as with `shrink-register-history`. The server keeps the old
  file when a save changes the format.
- **Priority is unset, not "Unclassified".** `priority` becomes `null` until
  chosen, matching estimate, type and due date. "Unclassified" survives only as
  the label for null.
- **States.** `In Progress` and `Accepted-Backlog` go. Open work is `New`
  (unscheduled) or `Committed` (has a ship release); `Blocked` and `Deferred`
  return on a revisit day; `Won't Do` and `Done` are closed.
- **Defer and Block take a ticket off the plan.** They clear its release. It
  comes back through Fill out, and is scheduled again from there. Otherwise a
  blocked ticket would sit in a release and come up at close-out as if it were
  being worked.
- **Accept is recorded, not keyed.** Completing the required fields on a Fill
  out card records an Accept decision, so the summary export still has an
  accepted group. Returned work gets an explicit "take it on" (`a`), which
  records Accept too.
- **Close-out choices are decisions.** Done and carry over are recorded in the
  decision log, so the export can say what shipped and what slipped. Back to
  backlog is recorded as an unschedule.
- **"Starts too late" needs one stored date.** Progress through a span is
  normal: once v0.23 ships, a ticket spanning v0.23–v0.24 has a shipped release
  in its span and is fine. What matters is whether the span had already started
  when the plan was made. So a ticket stores `planned`: the day its ship release
  or estimate was last set by a person. Carry-over does not touch it. A ticket
  starts too late when the first release in its span had shipped by that day,
  or when there are not enough releases before its ship release to hold it.
- **"Being worked on"** is derived: a scheduled ticket whose span includes the
  current release, or whose ship release has shipped.
- **Capacity per release** stays `commitTargetPerSprint`, now in span units.
