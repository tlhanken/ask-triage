# ticket-tracking

## ADDED Requirements

### Requirement: Weekly revisits

Deferred work SHALL be given a revisit date in whole weeks, and every revisit date
SHALL fall on the same day of the week, so that deferred work returns in one
batch. The revisit day SHALL be defined in one place. A deferred ticket whose
revisit day has arrived SHALL return to the decision queue ahead of undecided
work, and SHALL be shown as having come back.

#### Scenario: Weeks, not days

- WHEN a deferral is recorded
- THEN the revisit is chosen in whole weeks
- AND an arbitrary single date cannot be chosen

#### Scenario: Every revisit lands on the same day

- WHEN a revisit date is produced from any day of the week
- THEN it falls on the revisit day
- AND deferring on the revisit day itself is a full week out, not the same day

#### Scenario: Deferred work returns

- WHEN a deferred ticket's revisit day has arrived
- THEN it appears in the decision queue ahead of undecided work
- AND it is labelled as having come back for revisiting

#### Scenario: Returning is not automatic

- WHEN a deferred ticket's revisit day has not yet arrived
- THEN it does not appear in the decision queue

#### Scenario: Deciding again clears it

- WHEN a ticket that came back is accepted, declined, or deferred again
- THEN it stops returning
- AND deferring again moves the revisit to the later date
