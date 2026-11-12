## ADDED Requirements

### Requirement: Planning settings are editable

Release capacity, sprint length, throughput, the flag thresholds and the
draft-score weights SHALL be editable in the application. Each setting SHALL
state what it drives. Saving SHALL be a single revertible action, and an invalid
value SHALL be refused with its reason. The releases and the project list keep
their own editors.

#### Scenario: Changing capacity

- WHEN capacity per release is changed and saved
- THEN every release's load is measured against the new capacity
- AND the change appears in History and can be reverted

#### Scenario: Every setting explains itself

- WHEN the settings are open
- THEN each setting names what it drives

#### Scenario: An invalid value

- WHEN capacity is set to zero, or a weight to a negative number
- THEN the problem is named next to the field
- AND nothing is saved until it is fixed

#### Scenario: Restoring defaults

- WHEN defaults are restored in the settings
- THEN the form shows the default values
- AND nothing changes until they are saved

#### Scenario: Saving nothing new

- WHEN the settings are saved unchanged
- THEN no history entry is recorded
