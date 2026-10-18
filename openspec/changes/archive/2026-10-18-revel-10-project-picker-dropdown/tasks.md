# Tasks

## Picker

- [x] `matchProjects` — filter, rank, cap, and report the total
- [x] `PROJECT_SUGGESTION_CAP` = 50, with the omitted count shown
- [x] Prefix matches rank first; ties keep list order
- [x] Dropdown overlays the form with a bounded, scrolling height
- [x] Chips only for attached projects
- [x] Up/down/enter/escape, nothing pre-selected
- [x] The input has an accessible label

## Scale

- [x] Project tallies computed in one pass instead of one scan per project
- [x] Projects that have left the list are skipped, not invented

## Verification

- [x] 500 projects: only the cap renders, total reported correctly
- [x] Substring narrowing, prefix ranking, and already-attached exclusion
- [x] Picker behaviour through the app: open, filter, attach, detach, keyboard
- [x] 122 tests, typecheck and build clean

## Not done

- The project view toolbar still renders a chip button per project. Converting it
  to a picker changes a fast interaction when the list is short, so it is a
  separate decision rather than a side effect of this one.
