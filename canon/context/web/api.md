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

### `worker/auth/`

Holds sign-in and the guard every route sits behind. The app runs the body limit, then `csrf()`, then a check that answers `415 unsupported_media_type` to any unsafe-method body other than JSON, then the guard.

- `guard.ts` lets a signed-out caller reach `GET /api/health` and `POST /api/auth/sign-in` alone, so a new route, an unknown path included, answers `401 unauthenticated` until signed in
- `guard.ts` puts `user` and `sessionId` on the Hono context, which later routes read, and `requireAdmin` answers `403 forbidden` on `/api/admin/*`
- `session.ts` issues a 180-day `__Host-session` cookie, stores only the SHA-256 of its token, and slides the expiry at most once a day
- `attempts.ts` refuses past 10 failures per username or 50 per `CF-Connecting-IP` in 15 minutes. Only the edge sets that header, so a local spec counting failures passes its own.
- `password.ts` verifies PBKDF2 hashes from `shared/password-hash.ts`, whose exception to the installed hash rule is `.claude/rules/project/code/passwords.md`

### `worker/db/`

Holds the Drizzle schema, the client a route gets its database from, the migrations `drizzle-kit` writes, and a rollback for each.

- Edit the schema and run `bun run db:generate` for the next migration, since an applied migration is never edited
- Each migration takes a rollback of the same file name under `rollbacks/`, and a spec fails when one is missing or leaves a table behind
- `bun run db:migrate` and `bun run dev` read the same local database under `.wrangler/state/v3/d1`

### `worker/calendar/`

Holds the trip, entry, and history rules the routes call as `person`, which the assistant's bridge will call as `assistant`.

- Every write is one D1 batch opening on its change row, inserted only while the version, range, and id checks hold, and every later statement waits on that row, so a refused check writes nothing
- Rows are soft-deleted, so a read never returns a deleted trip, a deleted entry, or an entry of a deleted trip
- Update and delete take the version the caller read and answer `edit_conflict` on a stale one. Create takes a client id, and a retry with the same body answers the stored row.
- Undo writes a change's `before` back as an `undo` change, refusing `undo_conflict` unless the row still holds that change's `after`, and `already_undone` on a second try
- A trip's zone change moves the entries in its old zone, keeping their clock times, and records which, so undoing it moves the same ones back

### `shared/`

Holds the schemas the app, the API, and later the assistant's tools all import as `@shared/*`, plus the password hash and generator the Worker and the admin command share. The import direction between it, `src/`, and `worker/` is `.claude/rules/project/code/imports.md`.

- The root typecheck has no Worker types, so a binding type written here fails `bun run typecheck`

### Other folders

The Worker's two smaller folders each carry one job.

- `worker/routes/`: one Hono router per API area, being health, `/api/auth/`, `/api/admin/users`, `/api/settings`, and the calendar's `/api/trips`, `/api/entries`, and `/api/changes`
- `worker/test/`: the migrating setup, the test-only binding types, and builders for invented accounts, trips, entries, and requests. `bare()` sends the Origin `csrf()` needs on a bodiless POST.

## Gotchas

- `worker/worker-configuration.d.ts` is generated and gitignored, and `bun run typecheck` regenerates it before compiling the Worker
- Storage resets per spec file rather than per test, so a case that writes or rolls back hands its state to the next case in that file
- `vitest.config.ts` merges `vite.config.ts`, so `cloudflare()` loads in both test projects. Suspect it first when `bun run test:run` hangs after a plugin upgrade.
- Coverage runs on V8, which Cloudflare's known-issues page calls unsupported. Switch to Istanbul and exclude `worker/db/migrations/` if CI reports `worker/` at zero.
- Drizzle's D1 batch throws on a `db.run()` carrying parameters, so a guarded insert goes through `insertWhen()` in `worker/calendar/record.ts`, with `deferForeignKeys()` ahead of it
