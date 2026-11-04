# Make Unaccounted a built-in label and retire Unlabeled

The app always has an active Label: a built-in Unaccounted label is created on first launch, is the fallback when the user deselects another Label, and cannot be renamed, recoloured, or archived. This removes the Unlabeled state, so every recorded second belongs to a Block and only true Gaps remain outside Labels.

## Considered Options

- **Keep Unlabeled and show a derived Unaccounted row**: rejected because the user wants a default Label to be active whenever no other is.
- **A normal, editable label named Unaccounted**: rejected because the default could be renamed or archived, leaving no fallback.

## Consequences

- Active label is never empty.
- Gaps are the only time not covered by a Block, and they cannot be filled retroactively.
- A pre-existing v1 label named "Unaccounted" is reused as the built-in identity during migration.
