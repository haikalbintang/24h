# Use a fixed 24-hour Day chain anchored at first launch

Days are contiguous windows of exactly 24 hours starting at the local midnight before first launch, not calendar days. This keeps the Day clock and Block durations exact across DST transitions. The trade-off is that Day boundaries drift by an hour in local clock time after a DST change; the app deliberately does not compensate, and names each Day by the local date at its midpoint.

## Considered Options

- **Calendar days with DST-aware 23/25-hour windows**: rejected because the clock would jump or repeat within a Day, and durations would stop being literal.
- **UTC days**: rejected because they do not match the local day the user is living in.
