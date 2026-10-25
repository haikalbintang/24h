# Day Labels

A single-page personal time tracker that shows the current day as a running clock and records what the user is doing through one active label at a time.

## Language

**Anchor**:
The local midnight at first launch from which the chain of 24-hour days begins.
_Avoid_: epoch, zero point

**Day**:
One window in the contiguous chain of exactly 24 hours starting at the anchor. Boundaries fall at anchor + n × 24h and drift by an hour in local clock time after a DST change.
_Avoid_: calendar day, local day, UTC day

**Day label**:
The local date at the midpoint of a Day, used to name that Day in the date picker.
_Avoid_: date, day name

**Day clock**:
The timer measuring elapsed time since the start of the current day, displayed as hours, minutes, and seconds. It always runs from 00:00:00 to 23:59:59.
_Avoid_: 24-hour timer, countdown, stopwatch

**Label**:
A user-created activity tag that describes what is currently happening.
_Avoid_: tag, category, status

**Active label**:
The single label currently applied to the day clock, if any.
_Avoid_: current tag, selected category

**Unlabeled**:
The state in which no label is active. The day clock keeps running, but no block accrues. A new install starts here.
_Avoid_: idle, spare, no tag

**Block**:
A continuous span during which one label was active, bounded by a label change or a day boundary. Crossing either closes the current block and opens the next.
_Avoid_: interval, session, slot, entry

**Manual block**:
A block the user creates retroactively over a gap or corrects after the fact, rather than one recorded live.
_Avoid_: backfill, entry, correction

**Gap**:
A span during which the app was not running, so no block was recorded. A gap is left empty in history until the user edits it.
_Avoid_: hole, downtime, missing time

**Unaccounted**:
Time within a Day that is not covered by any Block, whether Unlabeled or a Gap.
_Avoid_: unlabelled, missing time, idle

**Archived label**:
A label removed from the picker but retained so that its past blocks keep their identity.
_Avoid_: deleted label, hidden label
