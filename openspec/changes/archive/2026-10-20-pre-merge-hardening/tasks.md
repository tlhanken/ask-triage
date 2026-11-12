# Tasks

## Dead ends

- [x] `resetToSeed`: keeps history and decisions, fresh ids, recorded by `act`
- [x] Reset moved from the header to the History tab
- [x] `deleteTicket` keeps the ticket's decisions; a restored deferral returns

## The file

- [x] Atomic write: temp file, then rename; no leftovers
- [x] Refuse non-JSON (415) and foreign-origin (403) writes before reading
- [x] Exact path match for the endpoint
- [x] Verified against the running dev server; live file unchanged

## Loading

- [x] `readStore` used by browser storage, the endpoint and the file picker
- [x] Checked that the live `data/register.json` reads

## Dates

- [x] `slippedIn` compares local dates, and counts the freeze day
- [x] `localStamp` for History and Decisions; `iso` for export headings and filenames
- [x] `addDays` for the default plan, the date repair and the seed
- [x] Suite pinned to `America/Los_Angeles`

## Tooling

- [x] ESLint (typescript-eslint, react-hooks), `npm run lint`, in CI
