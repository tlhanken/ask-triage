# Tasks

## Model

- [x] `settings.projects` — the list is data
- [x] `DEFAULT_PROJECTS` is the seed for a fresh register
- [x] `ProjectId` is a string; the union is gone
- [x] Migration seeds the list, and unions back any name the tickets reference
- [x] `addProject` — trims, refuses blank and duplicate
- [x] `removeProject` — leaves the list and detaches from every carrier
- [x] `projectUsage` — the count for the confirmation

## Interface

- [x] Picker offers "add to the list" only when nothing matches
- [x] Ticket form takes the list from the store rather than a constant
- [x] Project view has a manage panel: add, filter, remove with the count named
- [x] The manage list is filtered and capped like the picker
- [x] A removed project falls the view back to another rather than showing nothing

## Verification

- [x] Add trims, refuses blanks and duplicates, and is a no-op when it changes nothing
- [x] Removal detaches from every carrier and deletes no ticket
- [x] Removal is one revertible action
- [x] A name the list lost but the tickets still carry comes back on load
- [x] Picker: add from the form, attach, and appear in the switcher
- [x] Real saved register migrates: 14 tickets, 25 snapshots, releases and every
      ticket project preserved
- [x] 133 tests, typecheck and build clean

## Not done

- No rename (add + remove covers it, with a detach in between)
- The project view switcher is still its chip row; unchanged deliberately
