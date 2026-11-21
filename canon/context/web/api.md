---
title: API
description: The Worker serving the app and the Hono API, its D1 database, and the schemas the app and the API share
---

# API

## Overview

Owns the Cloudflare Worker that serves the built app and answers `/api/*`, the local D1 database behind it, and the zod schemas both sides parse with. The React front end it serves is the subject of `canon/context/web/app.md`.

## Layout

### `worker/`

Holds the Worker entry and the Hono app mounted on `/api`. The root `wrangler.jsonc` sends only `/api/*` to the Worker first, so every other path, client routes included, answers the app shell.

- Every failure answers `{ error: { code, message } }` from `shared/errors.ts`, and a caller branches on `code` alone
- A thrown error answers `internal_error` and logs the route and the error class, never its message, which can carry SQL or text a person typed
- A body past 64 KB gets `body_too_large` before any route reads it
- Specs run inside workerd as the `worker` Vitest project, calling `app.request(path, init, env)` with no server running

### `worker/db/`

Holds the Drizzle schema, the client a route gets its database from, the migrations `drizzle-kit` writes, and a rollback for each.

- Edit the schema and run `bun run db:generate` for the next migration, since an applied migration is never edited
- Each migration takes a rollback of the same file name under `rollbacks/`, and a spec fails when one is missing or leaves a table behind
- `bun run db:migrate` and `bun run dev` read the same local database under `.wrangler/state/v3/d1`

### `shared/`

Holds the schemas the app, the API, and later the assistant's tools all import as `@shared/*`. The import direction between it, `src/`, and `worker/` is `.claude/rules/project/code/imports.md`.

- The root typecheck has no Worker types, so a binding type written here fails `bun run typecheck`

### Other folders

The Worker's two smaller folders each carry one job.

- `worker/routes/`: one Hono router per API area, mounted on the app
- `worker/test/`: the setup file migrating the database before each worker spec file, and the test-only binding types

## Gotchas

- `worker/worker-configuration.d.ts` is generated and gitignored, and `bun run typecheck` regenerates it before compiling the Worker
- Storage resets per spec file rather than per test, so a case that writes or rolls back hands its state to the next case in that file
- `vitest.config.ts` merges `vite.config.ts`, so `cloudflare()` loads in both test projects. Suspect it first when `bun run test:run` hangs after a plugin upgrade.
- Coverage runs on V8, which Cloudflare's known-issues page calls unsupported. Switch to Istanbul and exclude `worker/db/migrations/` if CI reports `worker/` at zero.
