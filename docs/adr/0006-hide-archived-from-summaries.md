# Hide archived labels from summaries and fold their time into Unaccounted

Archived labels remain visible on their Blocks, but they are removed from the Selected day legend and pie, the Seven day totals, and the Timeline. Their time is added to the Unaccounted total so the summary still adds up. This amends ADR-0003's expectation that archived labels stay visible in totals.

## Considered Options

- **Keep archived labels in totals**: rejected because the user wants them hidden from the day summaries.
- **Reassign archived Blocks to the Unaccounted label**: rejected because it would rewrite history and lose the archived identity.

## Consequences

- The Unaccounted total is an aggregate, not a single Label's duration.
- Archived labels still explain their Blocks in the Blocks list.
