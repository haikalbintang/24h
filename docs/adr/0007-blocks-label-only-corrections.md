# Limit Block corrections to relabelling and splitting

v2 removes Manual Blocks, start/end editing, and Block deletion. A Block's start and end are fixed once recorded; the user can only change its Label or split it at a chosen instant. This keeps every Block traceable to live recording and removes the overlap-validation and undo machinery those features required.

## Considered Options

- **Keep manual creation and time editing**: rejected because the user wants label-only corrections.
- **Keep deletion with undo**: rejected because the user wants no delete option.

## Consequences

- Gaps cannot be filled retroactively.
- A mis-recorded duration can only be corrected by splitting and relabelling, not by moving its boundaries or removing it.
- Stored v1 Manual Blocks are discarded during migration.
