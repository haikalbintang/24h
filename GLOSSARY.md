# Day Labels

A single-page personal time tracker that shows the current day as a running clock and records what the user is doing through one active label at a time. An account is optional; without one, all data stays on the current device.

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
The single Label currently applied to the Day clock. It is always present and falls back to the Unaccounted label when the user deselects another Label.
_Avoid_: current tag, selected category, unlabeled

**Unaccounted label**:
The built-in Label that is active whenever the user has not chosen another. It cannot be renamed, recoloured, or archived.
_Avoid_: default label, idle label

**Block**:
A continuous span during which one Label was active, bounded by a Label change or a Day boundary. Once recorded, its start and end are fixed; only its Label can change, or it can be split.
_Avoid_: interval, session, slot, entry, manual block, backfill

**Gap**:
A span during which no device was running, so no Block was recorded. A gap of two minutes or less extends the open Block; a longer gap stays Unaccounted and cannot be filled retroactively.
_Avoid_: hole, downtime, missing time

**Heartbeat**:
The last-seen timestamp recorded while a Block is open. Across an Account, the greatest Heartbeat shows whether any device was running.
_Avoid_: ping, tick, autosave

**Reopen prompt**:
The modal shown when a Block is still open but the gap since the last Heartbeat exceeds two minutes. It asks whether to end the Block at the last Heartbeat or keep the label through the gap.
_Avoid_: resume dialog, away modal, recovery prompt

**Unaccounted total**:
The time in a Day that is not attributed to a non-archived Label: Unaccounted-label Blocks, Archived-label Blocks, and Gaps.
_Avoid_: unlabelled, missing time, idle

**Archived label**:
A Label removed from the picker but retained on past Blocks. It is hidden from Totals and the Timeline, and its time is included in the Unaccounted total.
_Avoid_: deleted label, hidden label

**Account**:
An optional identity that keeps Shared state in sync across the devices signed in to it. Without an Account, the app is single-device.
_Avoid_: user, profile, login

**Shared state**:
The Anchor, Labels, Blocks, Active label, and Heartbeat that an Account keeps consistent across its devices.
_Avoid_: cloud data, server data

**Device state**:
Data that belongs to one installation and is never synced, such as the theme, the Account session, and the Account whose first sign-in was last resolved.
_Avoid_: local data, cache

**First sign-in prompt**:
The modal shown when a device with its own Shared state signs in to a non-empty Account it has not synced with before. It offers Merge (default: combine both, keeping the earliest Anchor) or Replace (keep the Account's Shared state, discarding the device's after confirmation). Signing in to a different Account prompts again; the same Account does not.
_Avoid_: merge dialog, conflict prompt, import prompt
