## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Source layout

`src/` is layered, and imports only point one way:

- `domain/` — pure logic, no IO
- `data/` — state, IO, and the composition root; may import `domain/`
- `app/`, `components/`, `hooks/` — may import `domain/` and `data/`
- `testing/` — shared test doubles plus the vitest setup entry; may import
  `domain/` and `data/`, and is itself imported only by tests and `vite.config.ts`

Tests sit beside what they exercise: unit tests next to their module, App-level
integration tests in `src/app/`, and shared doubles in `src/testing/`. Import
across folders with `@/` (e.g. `@/domain/blocks`) and within a folder with `./`.
Do not add barrel `index.ts` files.
