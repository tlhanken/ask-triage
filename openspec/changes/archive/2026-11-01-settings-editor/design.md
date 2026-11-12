# Design: settings-editor

## Where the knowledge lives

`domain/settings.ts` holds one list, `SETTING_FIELDS`: for each setting, its
path in `Settings`, a label, what it drives, its unit, and its rule (whole
number of at least 1, or a number of at least 0). The dialog renders from that
list, and `validateSettings` checks against it. Adding a setting is one entry
there plus the default in `schema.ts`; the dialog needs no change.

`updateSettings(store, values)` validates, builds the new `Settings`, and
returns the store unchanged when the values are invalid or equal to the current
ones, so `withHistory` records nothing for either.

The releases and the project list are also in `Settings`, but they have their
own editors (Schedule, Projects). This dialog never touches them.

## Groups

    Planning      capacity per release, sprint length, throughput
    Flags         due-risk horizon, stale after, old with no date, slipped after
    Draft score   critical, should, urgency horizon, points per day inside it,
                  points per 30 days waited, points per carry-over, small-work bonus

## Why remove intakePerWeek

It existed to compute `netGrowthPerWeek`, which no screen or export shows.
Showing it would mean a hand-entered estimate of intake, when the register
already knows when every ticket was opened. If net growth is wanted later, it
should be derived from `opened` dates, not typed in.
