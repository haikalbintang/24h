# Store all data client-side in localStorage

The app has no server, accounts, or sync; all Labels and Blocks live in the browser's localStorage on the single device. This keeps deployment to a static site, works offline, and avoids backend cost and personal-data exposure. The trade-off is that data is device-bound and can be lost when browser storage is cleared, so JSON and CSV export are the escape hatch rather than a sync feature.

## Considered Options

- **Backend with accounts and sync**: rejected for v1 because it adds auth, hosting, privacy exposure, and conflict handling to a personal single-device tracker.
- **IndexedDB**: rejected because the versioned document is small and localStorage keeps the persistence adapter simple.
