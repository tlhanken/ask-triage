## MODIFIED Requirements

### Requirement: Local-first persistence

Ticket data SHALL be stored on the user's machine and SHALL NOT require a
database or a network service. When a development or preview server is present,
the register SHALL additionally be written to a JSON file on the user's machine
outside version control, so that no real ask is ever committed. While the server
is present, that file SHALL be the source of truth: browser storage SHALL be a
cache of it.

#### Scenario: Both layers

- WHEN the application is served by the development or preview server
- THEN changes are written to `data/register.json` as well as to browser storage

#### Scenario: No server

- WHEN the application is opened from a static build
- THEN it still works, and the file path degrades to a file picker or a download

#### Scenario: Incompatible save

- WHEN the stored data does not match the current model
- THEN the application starts from the seed data instead of loading it

#### Scenario: Adopting a newer file

- WHEN the application starts with a server present and a register file exists
- THEN the file is loaded, whatever browser storage holds
- AND nothing is written to the file until that load has finished

#### Scenario: Establishing the file

- WHEN the application starts with a server present and no register file exists
- THEN the browser's register is written to establish it

#### Scenario: A file this version cannot read

- WHEN the application starts with a server present and the register file is not
  one this version can read
- THEN nothing is written to the file automatically
- AND the application says so, and replaces the file only when the user saves to
  it deliberately

### Requirement: Release dates drive automatic placement

Auto-optimize SHALL reason from release dates: it SHALL NOT propose a release
that has already shipped, SHALL NOT propose a frozen release, SHALL fill releases
in release-date order, and SHALL prefer the earliest release that ships on or
before the ticket's due date. When no release ships in time it SHALL say so.

#### Scenario: Shipped and frozen releases are skipped

- WHEN a release has shipped, or has frozen
- THEN auto-optimize proposes no work into it

#### Scenario: Choosing by date

- WHEN a ticket has a due date
- THEN auto-optimize prefers the earliest release shipping on or before it

#### Scenario: No release ships in time

- WHEN no eligible release ships before a ticket's due date
- THEN the proposal still places it in the earliest release with room
- AND the move is marked as a conflict

#### Scenario: A release with no date is still usable

- WHEN a release has no release date
- THEN auto-optimize may place work into it
- AND it is considered after every dated release
- AND a ticket with a due date placed there is flagged as uncheckable

#### Scenario: Nothing to reason about

- WHEN no release is eligible, or no open ticket is unscheduled
- THEN auto-optimize proposes nothing
- AND it states the reason

#### Scenario: Explaining a limited proposal

- WHEN a proposal places fewer tickets than it considered
- THEN it states what limited it
- AND the reason names the releases that were frozen, shipped, at capacity, or undated

## ADDED Requirements

### Requirement: The application keeps its own history

The register file SHALL NOT be the only way to recover an earlier state. The
application SHALL keep its own history of the register, inside the register, and
SHALL revert from it.

#### Scenario: Reverting with no file at all

- WHEN the application runs from a static build, with no register file, and a
  change is made
- THEN the change can be reverted from History

### Requirement: Working without a server

When no development or preview server is present, the application SHALL offer a
file-based alternative to the register file, and a download of the register.

#### Scenario: Keeping a copy from a static build

- WHEN the application runs with no server and the register is downloaded
- THEN the download holds the whole register, history included

### Requirement: An incompatible save is refused whole

A save produced by an incompatible earlier model SHALL NOT be loaded partially:
it SHALL be refused whole, from every load path.

#### Scenario: An older format in browser storage

- WHEN browser storage holds a register in an earlier stored format
- THEN none of it is loaded, and the application starts from the seed data

### Requirement: Releases with no date stay usable

A release with no release date SHALL remain usable for auto-optimize, SHALL be
considered after every dated release, and SHALL mark any dated ticket placed into
it as uncertain.

#### Scenario: Dated releases are filled first

- WHEN a dated release and an undated one both have room for a ticket
- THEN auto-optimize proposes the dated one

### Requirement: Auto-optimize explains itself

Auto-optimize SHALL state the reason whenever it proposes nothing, and SHALL
state what limited it whenever it places fewer tickets than it considered.

#### Scenario: Every release is frozen

- WHEN every release that has not shipped is frozen
- THEN auto-optimize proposes nothing
- AND it names the frozen releases as the reason
