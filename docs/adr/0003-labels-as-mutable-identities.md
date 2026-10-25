# Treat Labels as mutable identities, never deletions

A Label has a stable identity; renaming or recolouring it updates every Block that references it, and archiving hides it from the picker without touching history. This preserves the user's past records and avoids mass rewrites. The deliberate consequence is that Labels cannot be hard-deleted, and archived Labels remain visible on historical Blocks.

## Considered Options

- **Delete Labels and cascade or orphan their Blocks**: rejected because it destroys history the user did not ask to lose.
- **Copy name and colour into every Block**: rejected because a later rename or recolour would not propagate to past Blocks.
