# Design — a button that does nothing must say why

## The defect

`optimizePlan` returned `Move[]`, so "nothing to do" and "I cannot reason about
your releases" were the same value: an empty array. The interface then wrote one
sentence listing four possible causes, because it had no way to know which one
applied.

That is the actual failure. Not that the algorithm was wrong — for a store whose
releases had dates it worked — but that the tool answered a question with silence
and the silence was indistinguishable from a correct "you are all caught up".

The rule this produced: **a proposal is a result, not a list.** The return value
now carries the reasoning that produced it — eligible, skipped and why, undated,
at capacity, considered, unplaced — and the sentence in the interface is rendered
from that, so it cannot drift from what the code actually did.

## Missing metadata should not stop the work

The second half of the defect. Eligibility required `release !== null`, on the
reasoning that a release with no date cannot be checked against a due date. The
reasoning is sound; the conclusion was not. Losing one check is not a reason to
refuse to place anything at all — it is a reason to place and flag.

So an undated release is eligible, sorts after every dated release (date-ordered
reasoning still wins where it can be applied) and marks any dated ticket landing
in it. The uncertainty is surfaced on the move rather than hidden behind an empty
proposal.

This generalises: **prefer acting with a stated uncertainty over refusing to act.**
A silent refusal is the worst option, because the person cannot tell whether the
tool is finished or broken.

Ordering had to be decided too, and it is not arbitrary: an undated release falls
back to version order, oldest first. That is the direction the date-repair offer
uses, so if the dates are then filled in, the placements already made agree with
the dates just created. If the fallback ran newest-first, accepting the repair
would silently contradict the proposal the user had just accepted.

## Repairing the data, explicitly

The undated release state comes from saves that predate release dates. The tool
should not silently invent dates — that is fabrication — but leaving the user in
a state they cannot see or fix is not acceptable either. Hence an offer, next to
the explanation of why the dates matter, which fills a two-week cadence oldest
version first. Oldest-first matters: the sails of the ordering are version order,
so v0.21 must ship before v0.25 or the board reads backwards.

## Why a result object rather than a second function

A separate `explainPlan` that recomputed eligibility would duplicate the decision
logic and drift. `optimizePlan` computes it once and `explainPlan` only formats
what it finds, which is why the explanation can be trusted to match the proposal.
