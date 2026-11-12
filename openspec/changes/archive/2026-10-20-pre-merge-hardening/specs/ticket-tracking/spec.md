## ADDED Requirements

### Requirement: The decision log is append-only

A decision SHALL remain in the decision log once it is recorded. Deleting a
ticket SHALL NOT remove its decisions. Resetting to the demo data SHALL NOT
remove decisions either, and SHALL give the demo tickets ids that no existing
ticket or decision uses. Resetting SHALL be recorded in the history like any
other change, so that it can be reverted.

#### Scenario: A deleted deferral comes back

- WHEN a deferred ticket is deleted and the deletion is reverted
- THEN its revisit date is still known
- AND it returns to triage on that day

#### Scenario: Reset can be undone

- WHEN the register is reset to the demo data
- THEN the reset appears in the history
- AND reverting it restores the tickets and settings from before it
- AND no demo ticket reuses an existing ticket's id

#### Scenario: Reset is out of the way

- WHEN the application is open on any tab
- THEN the header offers no reset
- AND reset is offered on the History tab, saying that it can be reverted

### Requirement: The register file is written safely

The file endpoint SHALL replace the register file in a single step, so that a
failed write leaves the previous register whole. It SHALL refuse a write that is
not sent as JSON, or that comes from an origin other than its own, before it
reads the body. It SHALL serve only its own path.

#### Scenario: A write that fails part-way

- WHEN a write to the register file fails before it completes
- THEN the previous register file is unchanged
- AND no temporary file is left beside it

#### Scenario: A write from another site

- WHEN a page from another origin posts to the file endpoint
- THEN the write is refused and the file is unchanged

#### Scenario: A write that is not JSON

- WHEN a write arrives with a content type other than JSON
- THEN it is refused and the file is unchanged

#### Scenario: The application's own write over the network

- WHEN the application is reached by another host name, such as over a private
  network, and saves
- THEN the write is accepted

### Requirement: Every load path reads the same way

Browser storage, the file endpoint, and a file the user picks SHALL all be read by
the same parse, validate, and migrate steps. A register that does not pass them
SHALL be refused whole and SHALL NOT replace the current state.

#### Scenario: A file that is not a register

- WHEN the user loads a file that has no settings, or comes from an unknown
  version
- THEN the application says it cannot read it
- AND the current register is unchanged

### Requirement: Dates are local

Timestamps SHALL be stored in UTC and SHALL be shown, and compared with dates,
as the user's local date and time. A day count SHALL step calendar days, so
that crossing a daylight-saving change cannot skip or repeat a date. A release
SHALL be frozen on its freeze day, so a ticket placed into it that day SHALL count
as scope after freeze.

#### Scenario: An evening edit

- WHEN a change is made late in the evening, west of Greenwich
- THEN History, Decisions, exports and their filenames show that day, not the
  next

#### Scenario: Placed on the freeze day

- WHEN a ticket is placed into a release on its freeze day
- THEN it is counted as scope after freeze

#### Scenario: Across a clock change

- WHEN a date is computed a number of days ahead across a daylight-saving change
- THEN it lands on the same calendar date as it would without the change
