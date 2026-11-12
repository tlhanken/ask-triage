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

## ADDED Requirements

### Requirement: A format change keeps the old file

When a write changes the register's stored format version, the file endpoint
SHALL first keep the file it replaces beside the register, under a name that
records its format and when it was replaced, and SHALL NOT modify that copy
afterwards.

#### Scenario: A format change keeps the old file

- WHEN a write replaces a register file stored in a different format version
- THEN the replaced file is kept, unchanged, beside the register
- AND a write that keeps the format version keeps no copy

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

#### Scenario: A write that does not say what it was based on

- WHEN a write that names no version arrives and a register file already exists
- THEN it is refused and the file is unchanged

#### Scenario: A hand edit

- WHEN the register file is edited outside the application after a tab loaded it
- THEN that tab's next write is refused

#### Scenario: Reloading after a refusal

- WHEN the user reloads the file after a refused write
- THEN the tab shows the file's register, including its history, and saving
  resumes
