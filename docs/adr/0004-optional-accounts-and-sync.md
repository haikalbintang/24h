# Add optional accounts and server sync

Day Labels v2 keeps local-only use as the default, but adds an optional Supabase account (email magic link, optionally Google, and Device handoff via QR code or magic link from an already-signed-in device) so two or more devices can share one timeline. When signed in, the Anchor, Labels, Blocks, Active label, and Heartbeat form one shared document with per-entity merge and a single shared open Block; the theme and session stay device-local, while rotated session credentials are coordinated through the Account. Supabase stores the document server-readably under row-level security, and signed-in sessions auto-refresh so linked devices stay signed in until explicitly signed out on that device.

## Status

Accepted. Supersedes [ADR-0001](./0001-client-only-localstorage.md).

## Considered Options

- **Anonymous sync code with end-to-end encryption**: rejected because the user chose accounts and server-readable storage for v2; a separate recovery key is a large extra failure mode.
- **Firebase**: rejected because document merge is less natural than Postgres rows.
- **Self-hosted auth**: rejected because it moves auth security and uptime onto this project.
- **No sync (ADR-0001)**: rejected because v2 must work across devices.

## Consequences

- Personal data leaves the device when signed in; ADR-0001's no-server constraint no longer holds.
- Signing out keeps the local copy, stops syncing, and leaves the app usable single-device.
- Merge is per-entity: Labels and Blocks are unioned by id with last-write-wins, and overlapping Blocks are repaired deterministically.
- Device clocks are assumed to be within about a minute of each other.
