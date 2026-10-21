## MODIFIED Requirements

### Requirement: Local-first persistence

Ticket data SHALL be stored on the user's machine and SHALL NOT require a
database or a network service. When a development or preview server is present,
the register SHALL additionally be written to a JSON file on the user's machine
outside version control, so that no real ask is ever committed. While the server
is present, that file SHALL be the source of truth: browser storage SHALL be a
cache of it. That file SHALL NOT be the only way to recover an earlier state:
the application SHALL keep its own snapshots of the register and SHALL revert
from them. When no such server is present, the application SHALL offer a
file-based alternative and a download. A save produced by an incompatible
earlier model SHALL NOT be loaded partially.

#### Scenario: Both layers

- WHEN the application is served by the development or preview server
- THEN changes are written to `data/register.json` as well as to browser storage

#### Scenario: No server

- WHEN the application is opened from a static build
- THEN it still works, and the file path degrades to a file picker or a download

#### Scenario: Incompatible save

- WHEN the stored data does not match the current model
- THEN the application starts from the seed data instead of loading it

#### Scenario: The file wins on startup

- WHEN the application starts with a server present and a register file exists
- THEN the file is loaded, whatever browser storage holds
- AND nothing is written to the file until that load has finished

#### Scenario: Establishing the file

- WHEN the application starts with a server present and no register file exists
- THEN the browser's register is written to establish it

## ADDED Requirements

### Requirement: Stale writes are refused

Every write to the register file SHALL identify the version of the file it was
based on. The server SHALL refuse a write based on a version that is no longer
current. After a refused write the application SHALL stop writing to the file,
SHALL say that another tab or machine changed the register, and SHALL offer to
reload the file or to download its own copy first.

#### Scenario: Two tabs

- WHEN a change is saved from one tab, and then a change is made in a second
  tab that loaded the file earlier
- THEN the second tab's write is refused and the file keeps the first tab's
  change
- AND the second tab says why, and offers to reload or to download its copy

#### Scenario: Nothing is lost by a refusal

- WHEN a write is refused and the user downloads this tab's copy
- THEN the download holds every change made in this tab

#### Scenario: An ordinary save

- WHEN only one tab is open and changes are made
- THEN every write is accepted
