# Architecture

How this app is put together, and how to change it without making it worse.
Read this before editing code. `README.md` covers using the app; this covers
building it.

## In one paragraph

A React app with no backend. The whole register (tickets, releases, settings,
decisions, history) is one plain object, the `Store`. Every change is a pure
function `Store → Store` in `src/domain/`, run through `withHistory` so it is
labelled and revertible. The UI in `src/ui/` renders the store and calls those
functions. The store is saved to browser storage on every change, and to a JSON
file through a small dev-server endpoint in `src/server/`, which refuses stale
writes.

## Layout

    src/
      main.tsx              mounts ui/App
      domain/               pure logic: no React, no DOM, no I/O (lint enforces this)
        schema.ts           the data model: Ticket, Sprint, Settings, the fixed lists
        dates.ts            local calendar dates; the weekly revisit day
        releases.ts         ship order, spans, load, frozen/shipped, date fit
        assess.ts           readiness, nudges, flags and risk alerts, draft score
        store.ts            the Store shape, parse/validate/serialize, plain edits
        history.ts          change records, withHistory, revert
        decisions.ts        accept/defer/decline/block, close-out, revisits
        optimize.ts         auto-optimize; the release-date repair
        pipeline.ts         the Plan page's queues and the header counts
        seed.ts             demo tickets for a fresh register
        exporters.ts        markdown, CSV and JSON text
        test-fixtures.ts    shared test helpers (never imported by the app)
        <module>.test.ts    tests for <module>.ts
      ui/                   React screens and browser I/O
        App.tsx             state, act(), startup, autosave, tabs, modals
        Plan.tsx            Fill out and Check steps; hosts Schedule
        Schedule.tsx        the release board
        Projects.tsx        project list and due-date table
        Register.tsx, Decisions.tsx, History.tsx
        TicketForm.tsx, SprintForm.tsx    the editors
        fields.tsx          the four required-field controls, shared
        persist.ts          browser storage, and the client side of the file endpoint
        download.ts         clipboard and file download
        keys.ts             when a keyboard shortcut should be ignored
        styles.css
        app.test.tsx        screen tests; sync.test.tsx: file-endpoint tests
      server/
        localData.ts        the /__data endpoint: ETag, If-Match, atomic write, backups
    openspec/
      specs/ticket-tracking/spec.md      the live behavioural contract
      changes/archive/                    why each change was made
    vite.config.ts          wires the endpoint in; ASK_TRIAGE_* settings; test config

## Layer rules

Imports only point down this list. Nothing imports upward, and there are no cycles.

    ui/          → domain/, ui/persist, ui/download
    pipeline     → decisions, history, assess, releases, store, schema
    decisions    → assess, releases, dates, store, schema
    optimize     → assess, releases, dates, store, schema
    history      → releases, dates, store, schema
    store        → releases, dates, seed, schema
    assess       → releases, dates, schema
    releases     → dates, schema
    schema, dates  (nothing)

- `src/domain` never touches React, the DOM, `localStorage` or `fetch`.
  `npm run lint` (and so CI) fails if it does. Browser I/O goes in `src/ui/persist.ts`.
- A domain function takes the store (and `now`, defaulting to `new Date()`) and
  returns a new store. It never mutates its input. **When it changes nothing, it
  returns its input unchanged**, so `withHistory` records nothing. Several
  refusals rely on this, such as renaming a project to a name already in use.
- Anything that depends on today's date takes `now` as its last parameter. Tests
  pass a fixed date; nothing reads the clock at import time.

## Data flow

A user action:

    click → ui handler → act(label, mutate)                       (ui/App.tsx)
          → setStore(cur => withHistory(cur, label, mutate))      (domain/history.ts)
          → mutate(cur) returns the next store; withHistory compares before and
            after and appends a change record, or returns cur if nothing changed
          → React re-renders from the new store
          → effect: save() to browser storage                      (ui/persist.ts)
          → effect: after 600ms, writeFile() POSTs to /__data with If-Match
          → server: refuses if stale (409), else backs up on a format change and
            writes atomically                                      (server/localData.ts)

Startup: HEAD `/__data` (is there a server?), then GET it and adopt the file, and
only then switch autosave on. Without a server, browser storage is the only copy.
A stale write turns autosave off and shows a banner offering "Download my copy"
or "Reload from file". On `pagehide`, an unsaved change is sent with `keepalive`.

## The model, and its invariants

`Store` (domain/store.ts): `version`, `tickets`, `decisions`, `settings`,
`nextTicketId`, `nextDecisionId`, `history`.

Ticket fields come in three tiers (domain/schema.ts, `CORE_FIELDS` and the
others). A test fails if a ticket carries a field outside them.

- core: name, summary, projects, externalUrl, dueDate, noHardDate, estimate,
  priority, type
- optional: stakeholders, notes
- background (set by the app, read-only in the editor): state, opened, sprint,
  planned, carryovers, lastTouched, closed

These must always hold. `patchTicket` (domain/store.ts) enforces 1, 2 and 4, so
route every ticket edit through `updateTicket`, `editTicket` or a decision, never
a hand-built object spread.

1. `dueDate` and `noHardDate` never both hold. The newer answer wins.
2. An open ticket with a `sprint` is `Committed`; without one it is `New`.
3. `sprint` is the release the ticket **ships in**. Its span is derived: the
   `estimate` releases ending there, in **ship-date order** (`releaseOrder`).
   That is not the board's display order, which the owner arranges.
4. `planned` is stamped when a person sets the ship release, or changes the
   estimate of scheduled work, and is cleared when the ticket is unscheduled.
   Carry-over leaves it alone. It is what tells "starts too late" apart from
   ordinary progress.
5. A ticket that becomes ready through `editTicket` records an Accept decision.
6. Ticket and decision ids are never reused, including after a reset.
7. The decision log is append-only. History never rewrites it.
8. History entries hold only the before-state of what a change touched. A revert
   walks back from the current store. No full copy is stored.
9. Nothing stores "current release". It is derived (`currentRelease`).

Stored format: `STORE_VERSION` in domain/store.ts. `readStore` is the one way in
for every load path; it refuses anything that is not exactly this version.

## Words used in the code

    ready        priority, type, estimate, and a due date or noHardDate (assess.isReady)
    nudge        a missing detail that never blocks: project, summary, stakeholders
    gap / risk   an Alert's severity: missing data / something going wrong
    span         the releases a ticket occupies (releases.spanOf)
    load         open tickets spanning a release, one unit each (releases.loadUnits)
    ship order   releases by release date, undated last (releases.releaseOrder)
    current      earliest release neither shipped nor frozen
    close-out    choosing Done / Carry over / Back to backlog for a shipped release
    revisit      the Monday deferred or blocked work comes back (dates.REVISIT_WEEKDAY)
    set aside    deferred or blocked

## How to make common changes

Each recipe lists every place to touch. Run the commands at the end.

**Change a planning rule** (readiness, a risk, capacity, auto-optimize). Find the
owning module in the layout above, change the function, and update its
`<module>.test.ts`. If the behaviour a person sees changes, it is a spec change:
see "Spec changes" below.

**Add a risk alert.** Add it to `riskAlerts` in domain/assess.ts with a `kind`,
a short `what` and a `why` that states the consequence. An alert without a
consequence is not allowed. It then appears in Fill out and Check, and in the
Projects fit column if its kind is in `FIT_KINDS` (ui/Projects.tsx).

**Add a ticket field.**
1. domain/schema.ts: add it to `Ticket` and to exactly one tier list.
2. domain/store.ts: `blankTicket`; `looksValid` if a load must not lack it; bump
   `STORE_VERSION`.
3. domain/seed.ts: give every seed ticket a value.
4. domain/test-fixtures.ts: `mk`.
5. ui/TicketForm.tsx, for core or optional fields.
6. domain/exporters.ts: the CSV columns.
7. If the field is derivable from stored data, do not store it; derive it in
   assess.ts instead.

**Add a decision.** Add it to `DECISIONS` (schema.ts), handle it in
`applyToTicket` (decisions.ts), add a section in `decisionsToMarkdown`
(exporters.ts), then add the button in the screen that offers it.

**Add a screen or tab.** A component in src/ui, an entry in `TABS` (ui/App.tsx),
and its mutations wired through `act`. Read-only views need no `act`.

**Change the stored format.** Bump `STORE_VERSION`. The app has no real users
yet, so there is **no conversion code**: an older register is refused whole, and
the server keeps the replaced file as `register.v<old>.<timestamp>.json` beside
it. Once real registers exist, add one conversion function called from
`readStore`, so every load path runs it.

## Tests

    npm test            all of it (vitest)
    npm run typecheck   tsc --noEmit; unused names are errors
    npm run lint        correctness rules and the layer rule
    npm run build       typecheck, then vite build

- Domain tests call `freezeClock()` once at the top. That pins `Date` at `NOW`
  (2026-10-18), and with it the seed, `defaultSprints()` and `isoFromNow()`.
  Never build fixtures from a real clock.
- The seed starts with no estimates, so nothing in it is ready. Tests about
  scheduling start from `readyStore()`.
- Screen tests start the app from a given register with
  `startWith(store)` (app.test.tsx). sync.test.tsx drives a `FakeServer` that
  follows the real endpoint's rules.
- The test environment runs at `TZ=America/Los_Angeles`, where an evening
  timestamp is already tomorrow in UTC. That catches date bugs that UTC hides.

## Spec changes

Behaviour is specified in `openspec/specs/ticket-tracking/spec.md`. A change to
what a person sees goes through an OpenSpec change:

1. `openspec/changes/<name>/`: proposal.md (why), design.md (decisions),
   specs/ticket-tracking/spec.md (deltas), tasks.md.
2. `openspec validate <name> --strict`
3. Implement, tick tasks.md, run all four commands above.
4. `openspec archive <name> --yes`. This merges the deltas into the live spec.

A MODIFIED requirement must restate the whole requirement, every scenario
included. Archive refuses to drop a scenario silently. Refactors and tests need
no change.

## Pitfalls

- Do not rename the browser storage key (`STORAGE_KEY`, ui/persist.ts). It
  identifies existing saves.
- Do not compare or slice dates as UTC strings. Use `iso`, `parseDate`,
  `daysSince` and `addDays` from domain/dates.ts.
- Do not call `new Date()` at module level. Take `now` as a parameter.
- Do not write to a React ref during render (lint rule `react-hooks/refs`).
- Do not add a stored field that only restates other data. Derive it.
