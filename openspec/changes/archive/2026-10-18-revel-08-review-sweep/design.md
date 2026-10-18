# Design — an audit is not a decision loop

## Why a second screen

The existing Triage screen shows the undecided few and asks accept / defer /
decline. That narrowness is the feature: it is why a decision takes seconds. But
it means a ticket that is already accepted, or committed, or quietly rotting in a
shipped release never comes up again.

So completeness needs its own screen, and the two are kept deliberately distinct:

    Triage   decides · shows the undecided few · writes state
    Review   audits  · shows every ticket       · writes nothing

Merging them would have meant either widening the decision queue, which slows
every decision, or compressing the audit into a flag list, which loses the "look
at this one" quality that makes it useful.

## Every alert states its consequence

`computeFlags` returns a label: STALE, SLIPPED, UNPLANNED. A label on its own
tells you the tool is unhappy without saying what breaks, so the sweep carries a
`why` for each — "Committed work with no due date cannot be late, so nothing will
ever notice it slipping."

That is the test applied to each candidate alert: if it cannot state a
consequence, it is noise and does not go in. This is why there is no blanket
"no due date" or "no external link" alert — most undated asks are legitimately
undated, and firing on all of them would train the reader to ignore the screen.
No-due only fires where the absence has teeth: work already committed. External
links are skipped entirely, since nothing distinguishes a partner ask from an
internal one any more.

## Worst first

Ordering by alert count descending means the top of the list is the work that
fixes the most at once, and the tail is tickets that are fine. A sweep that went
in register order would make the operator hunt.

## Read-only, deliberately

The sweep does not fix anything inline. Editing is one explicit button, and
stepping past a ticket changes nothing. An audit pass that quietly writes is an
audit pass you cannot run out of curiosity.
