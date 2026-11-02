# Split the two requirements that hold several behaviours

## Why

`openspec validate --strict` fails on two requirements whose descriptions run
past 500 characters, because each states several behaviours at once:
"Local-first persistence" (741) and "Release dates drive automatic placement"
(626). A requirement that states one behaviour is easier to check against the
code, and to change without disturbing its neighbours.

## What Changes

No behaviour changes. Each long requirement keeps its name and every scenario,
and its description is cut to its first behaviour. Each behaviour removed
becomes its own requirement, with a scenario of its own:

- Local-first persistence → also "The application keeps its own history",
  "Working without a server" and "An incompatible save is refused whole".
- Release dates drive automatic placement → also "Releases with no date stay
  usable" and "Auto-optimize explains itself".

One word is brought up to date while moving: the application keeps its own
*history* of the register, which records changes, where the old text still said
*snapshots*. That is what "Version history and revert" already requires.

## Capabilities

### Modified Capabilities

- `ticket-tracking`: two requirements split, five added. No new behaviour.

## Impact

Spec only. No code or data changes.
