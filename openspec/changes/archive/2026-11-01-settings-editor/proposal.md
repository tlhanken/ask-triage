# Edit the planning settings in the app

## Why

Release capacity, sprint length, throughput, the flag thresholds and the
draft-score weights are stored in the register, but nothing in the app can
change them. A new register takes them from `DEFAULT_SETTINGS`, and changing
one means editing the JSON file by hand.

## What Changes

- A **Settings** dialog, opened from the header, edits every planning setting.
  Each one says what it drives, so a number is never changed blind.
- Values are checked before saving: capacity, sprint length and the day counts
  are whole numbers of at least 1; weights are numbers of 0 or more. An invalid
  value names the problem and saving waits until it is fixed.
- Saving is one change in History, so it can be reverted. Saving without a
  change records nothing.
- "Restore defaults" fills the form with the defaults; nothing changes until
  it is saved.
- `intakePerWeek` is removed. It fed a net-growth figure that nothing shows, so
  it drove nothing, and an editor field for it would edit nothing.

## Capabilities

### Modified Capabilities

- `ticket-tracking`: a new requirement makes the planning settings editable.

## Impact

Code: a new `domain/settings.ts` (field definitions, validation,
`updateSettings`), a `ui/SettingsForm.tsx` dialog, a header button. Tests for
both.

Data: none. The stored version is unchanged. A register that still carries
`intakePerWeek` loads as before; nothing reads it.
