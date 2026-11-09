# Always extend the open Block through a Gap

When the app finds a Gap since the last Heartbeat, it keeps the Active label and extends the open Block to the present, splitting only at Day boundaries. The reopen prompt and its two-minute threshold are removed. This reverses the previous rule that a longer Gap stayed Unaccounted until the user chose to end the Block or keep the label.

## Considered Options

- **Keep the reopen prompt**: rejected because the user wants no interruption and always keeps the label.
- **End the Block at the last Heartbeat**: rejected for the same reason; absence must never close a Block.
- **Cap the Gap and fall back to Unaccounted**: rejected because "always keep the label" admits no cap.
- **Auto-keep by mutating the Block**: rejected because bumping `updatedAt` would let a returning device override a newer Label switch made on another device. Auto-keep advances only the Heartbeat.

## Consequences

- Away time is attributed to the Label that was active, including overnight and multi-day absences.
- The two-minute threshold and the reopen prompt disappear; a Gap is no longer a distinct kind of Unaccounted time.
- Merge still resolves conflicts by the latest real edit, so another device's Label switch wins over a returning device's auto-keep.
- This amends ADR-0007's consequence that Gaps cannot be filled retroactively: an open Block now spans a Gap automatically, though the user still cannot move Block boundaries or fill a Gap with a different Label.
