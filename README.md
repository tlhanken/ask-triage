# Priority tracker

[![CI](https://github.com/tlhanken/ask-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/tlhanken/ask-triage/actions/workflows/ci.yml)

Tracks the software asks owed by the team and by the partner company, and decides
what happens to them week by week. No backend: a React app over a JSON file.

## Getting started

You need Node.js 22 (CI runs on 22) and npm.

    git clone https://github.com/tlhanken/ask-triage.git
    cd ask-triage
    npm install
    npm run dev

Open http://localhost:5173. A fresh clone starts from demo data. Opening the app
creates `data/register.json`, and every change is saved to it from then on.
Stop the server with Ctrl-C. Your data stays in that file.

**Use `dev` or `preview`.** Without one of those there is no server, so nothing
can be written to the register file and the app falls back to browser storage
only. The History tab's status line says which one is in use.

## Configuration

The defaults need no configuration. To change them, copy the example and edit
the copy:

    cp .env.example .env.local

`.env.example` is tracked and documents every setting. `.env.local` is
gitignored, so your settings stay on your machine. Restart the server after
editing it. Every setting is optional:

    ASK_TRIAGE_DATA_FILE   Where the register is saved. Relative paths are from
                           the repo root; `~` is not expanded, so use an absolute
                           path to leave the repo. Default: data/register.json
    ASK_TRIAGE_HOST        Which address to listen on. 0.0.0.0 listens on every
                           interface, e.g. to reach it over Tailscale.
                           Default: localhost only
    ASK_TRIAGE_PORT        Which port, for both dev and preview. If the port is
                           busy, the server refuses to start rather than picking
                           another. Default: 5173 for dev, 4173 for preview

A variable set in the shell wins over the file, for a one-off:

    ASK_TRIAGE_PORT=8080 npm run dev

**`ASK_TRIAGE_HOST=0.0.0.0` has no login.** Anyone who can reach the port can
read and edit the register. Only expose it on a network you trust, such as a
tailnet.

The planning settings (release capacity, sprint length, scoring weights) are not
in this file. They are stored inside the register itself, so they travel with
your data. Releases and projects are edited in the app. Capacity, sprint length
and weights have no editor yet; a new register takes them from
`DEFAULT_SETTINGS` in `src/schema.ts`.

## Commands

    npm run dev        # dev server; the file endpoint is active, so saves reach disk
    npm run preview    # the same, over a production build (run `npm run build` first)
    npm test           # vitest
    npm run typecheck  # tsc --noEmit
    npm run lint       # eslint, correctness rules only; it does not format
    npm run build      # typecheck, then vite build into dist/

## Where the data lives

Two layers, deliberately:

    data/register.json    The durable record, written indented. Gitignored: the
                          repo never carries real asks, and a fresh clone starts
                          from the seed in `src/seed.ts` instead. Its location
                          is configurable (ASK_TRIAGE_DATA_FILE).
    localStorage          The instant layer, invisible to git, keyed
                          `revel-priority-tracker-v1`. Do NOT rename that key: it
                          identifies existing saves, and renaming it orphans them.

While a server is running, the file is the source of truth and browser storage is a
cache of it. On startup the file is read first, whatever the browser holds, and
nothing is written until that read has finished. Every change is then written to
the file 600ms later. An empty file is ignored, so an accidental empty write can
never take over, and a file this version cannot read is never written over
automatically.

Every write says which version of the file it was based on. If another tab or
machine has changed the file since, the write is refused and the tab stops saving.
A banner offers to download this tab's copy, or to reload the file.

When a save changes the register's format version, the server first keeps the old
file beside it as `register.v<old>.<timestamp>.json` and never touches it again.
Delete those copies once the new format is trusted.

The file also carries the last 25 changes, which is what the History tab reverts
with. Each records only what its change touched, and a revert steps back from the
current register, so the history stays small however many tickets there are.

## The screens

    Plan       Three steps, each a queue that empties. The header counts them.
               1 Fill out   one ticket at a time: its missing priority, type,
                            estimate or due date are edited on the card. Filling
                            the last one accepts it. Decline, defer and block live
                            here; deferred and blocked work comes back first.
               2 Schedule   the release board. Ready work on the left; drag it into
                            a release, or let auto-optimize propose and explain.
               3 Check      what is going wrong per release, and close-out for
                            releases that shipped with work still open.
    Projects   Tickets by project. The project list is managed here.
    Register   Everything, filterable and sortable.
    Decisions  What was decided, exportable as markdown, CSV or JSON.
    History    Every change, revertible. A revert is itself recorded.

## Conventions worth knowing

- **The unit is the ask**, not the project. A project is a tag on the ask.
- **Blank until chosen.** Priority, type, estimate and due date start unset, and
  "no hard date" is a choice of its own. A default never stands in for a decision.
- **Ready to schedule** means priority, type, estimate, and a date or no hard date.
  Project, summary and stakeholders are nudges, never gates.
- **Every stored field must drive** a decision, a flag, a score term or a view.
  Fields that only restate other data are derived on read instead.
- **Work spans releases.** A ticket stores the release it ships in; an estimate of
  N sprints occupies the N releases ending there, in ship-date order, and costs one
  unit in each. A release is full when its load reaches capacity.
- **The current release is derived**: the earliest that has neither shipped nor
  frozen. Nothing stores it.
- **Deferred work returns on Mondays**, so revisits arrive as one batch with the
  weekly triage rather than trickling in daily.
- **Exceeding capacity and scope-after-freeze are reported, not blocked.** Blocking
  late work does not stop it; it only pushes the truth out of the tool.
- Spec changes go through OpenSpec. The live contract is
  `openspec/specs/ticket-tracking/spec.md`; the reasoning behind each change is the
  archived record under `openspec/changes/archive/`.

## Not done yet

- The project view's switcher is still one chip per project, and projects cannot be
  renamed. See `openspec/changes/projects-page`.

## License

MIT — see `LICENSE`.
