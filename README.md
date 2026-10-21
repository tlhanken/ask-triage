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

On startup the browser's copy wins. The file is adopted only when the browser has no
history and no decisions, and an empty file is ignored outright — so an accidental
empty write can never take over. Every change is written to the file 600ms later,
while a server is running.

The file also carries the last 25 state snapshots, which is what the History tab
reverts to.

## The screens

    Triage     One undecided ask at a time. Accept, defer, decline, or hand back.
               Work that was deferred and has come back leads the queue.
    Review     An audit pass over every ask: data missing where its absence has a
               consequence, and work going quietly wrong.
    Sprints    Release columns. Drag work between them; auto-optimize proposes and
               states its reasoning, including when it proposes nothing.
    Projects   Tickets by project. The project list is managed here.
    Register   Everything, filterable and sortable.
    Decisions  What was decided, exportable as markdown, CSV or JSON.
    History    Every change, revertible. A revert is itself recorded.

## Conventions worth knowing

- **The unit is the ask**, not the project. A project is a tag on the ask.
- **Every stored field must drive** a decision, a flag, a score term or a view.
  Fields that only restate other data are derived on read instead.
- **Capacity is measured in work units** (the ticket's estimate), not ticket count.
  A release is full when its load reaches capacity.
- **Deferred work returns on Mondays**, so revisits arrive as one batch with the
  weekly triage rather than trickling in daily.
- **Exceeding capacity and scope-after-freeze are reported, not blocked.** Blocking
  late work does not stop it; it only pushes the truth out of the tool.
- Spec changes go through OpenSpec. The live contract is
  `openspec/specs/ticket-tracking/spec.md`; the reasoning behind each change is the
  archived record under `openspec/changes/archive/`.

## Not done yet

- History is over 80% of the register file, stored as escaped JSON blobs, so the
  file is 190KB and every save rewrites all of it. The fix is proposed in
  `openspec/changes/shrink-register-history`: record each change as a delta
  instead of a full copy, so history shrinks without becoming a second file.
- The project view's switcher is still one chip per project, and projects cannot be
  renamed. See `openspec/changes/projects-page`.
- Nothing ever reaches Done, Blocked has no way back, and the triage capacity
  meter counts decisions while capacity everywhere else counts work units. The
  fix is one planning workflow: see `openspec/changes/plan-workflow`.
- A second tab or machine can silently overwrite the register file. See
  `openspec/changes/file-is-source-of-truth`.

## License

MIT — see `LICENSE`.
