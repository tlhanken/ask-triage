# Priority tracker

[![CI](https://github.com/tlhanken/ask-triage/actions/workflows/ci.yml/badge.svg)](https://github.com/tlhanken/ask-triage/actions/workflows/ci.yml)

Tracks the software asks owed by the team and by the partner company, and decides
what happens to them week by week. No backend: a React app over a JSON file.

## Run it

    npm install
    npm run dev        # dev server — the file endpoint is active, so saves reach disk
    npm run preview    # same, over a production build
    npm test           # vitest
    npm run typecheck  # tsc --noEmit
    npm run lint       # eslint, correctness rules only — it does not format
    npm run build      # typecheck, then vite build into dist/

Open the URL it prints. **Use `dev` or `preview`.** Without one of those there is no
server, so nothing can be written to `data/register.json` and the app falls back to
browser storage only. The History tab's status line says which one is in use.

## Where the data lives

Two layers, deliberately:

    data/register.json    The durable record, written indented. Gitignored — the
                          repo never carries real asks, and a fresh clone starts
                          from the seed in `src/seed.ts` instead.
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
- The project view's switcher is still one chip per project; the picker used in the
  ticket form would scale better.
- The triage capacity meter counts decisions, while capacity everywhere else counts
  work units.

## License

MIT — see `LICENSE`.
