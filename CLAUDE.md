# CLAUDE.md

REST API of the Organic Economy (Node.js + Express + TypeScript, SQLite by default, Postgres via
`DB_DIALECT=postgres`). See `README.md` for setup and `organic-webserver/API.md` for the routes.

## Layout

- The code lives in the `organic-webserver/` subfolder: run every `npm` command from there.
- The `.env.*` files live at the repository root (`.env.dev`, `.env.test`, optional `.env.local`).

## Commands

From `organic-webserver/` (the `win*` variants are for Windows):

```bash
npm install
npm run server       # or: npm run winserver
npm test             # mocha, test/ ; or: npm run wintest
npm run build        # tsc --noEmit
npm run e2e          # scenario/e2e-solo.mjs against a running server
npm run seed -- --name=Alice --days=30   # or winseed ; seeded password is "a"
```

Before pushing, the full test suite and `npm run build` must pass.

## Code style

- Code, identifiers and comments are in English.
- No comments. Code should read on its own: when a passage seems to need one, split it into
  well-named methods that read like a sentence. Readability over brevity.
- 4-space indentation; for quotes and semicolons, match the file you are editing.
- Any change to a route updates `organic-webserver/API.md`.
- Protocol and blockchain rules belong to the `organic-protocol` and `organic-money` packages:
  change them there rather than working around them here.

## Tests

- TDD: write the failing test first, then the implementation, then see it pass.
- One test at a time, not a batch of tests followed by a batch of code.
- One `describe` per function or route, and every `it` starts with `should`, so it reads as a
  sentence: "it should …".
- Prefer end-to-end tests (through `supertest` on the app) when possible.

## Pull requests

- Small PRs, one step each, so they can be reviewed calmly.
