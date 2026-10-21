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

## Open questions

1. How should the due-date state be stored: a `noHardDate` flag, or a sentinel
   value?
2. Should undo-last-decision remain as its own mechanism, or should History
   revert cover it, given Accept no longer exists as a key?
3. Should the existing never-chosen estimates of 2 be cleared by the migration?
