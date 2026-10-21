## MODIFIED Requirements

### Requirement: Version history and revert

Every change SHALL record what is needed to restore the state it is about to
replace, under a human-readable label. Recording a change SHALL NOT store a
further full copy of the register. The history SHALL be viewable and SHALL allow
restoring the state from before any recorded change. A revert SHALL itself be
recorded so that it can be undone. History SHALL NOT rewrite the decision log.

#### Scenario: Recording

- WHEN a change is made
- THEN a labelled entry appears in the history
- AND a change that alters nothing records no entry

#### Scenario: Reverting

- WHEN a history entry is reverted to
- THEN tickets and settings are restored to the state before that change
- AND the revert itself appears in the history

#### Scenario: Bounded growth

- WHEN more changes are made than the history cap
- THEN the oldest entries are dropped and the most recent ones are kept

#### Scenario: Deletion is recoverable

- WHEN a ticket is deleted and the deletion is reverted
- THEN the ticket is restored
- AND its id is not reused by any later ticket

#### Scenario: History does not scale with the register

- WHEN the history cap is reached
- THEN the retained entries are not each a full copy of the register
- AND the size of the history is governed by the changes recorded, not by the
  number of tickets in the register

#### Scenario: Reverting past the oldest retained change

- WHEN a state older than the oldest recorded change is asked for
- THEN the oldest retained state is restored
- AND the revert is reported as reaching the end of the history rather than
  silently restoring a different state

## ADDED Requirements

### Requirement: The durable register stays one transportable file

The durable record SHALL remain a single file that can be exported, downloaded and
re-imported as a unit, so that a register moves between machines or to another
person by transferring one file. Keeping the history small SHALL NOT require
splitting the durable record across several files.

#### Scenario: Moving a register

- WHEN the user downloads the register and re-imports it elsewhere
- THEN the tickets, the decisions and the history all arrive together

#### Scenario: A full history does not force a split

- WHEN the history cap is reached
- THEN the register is still one file
