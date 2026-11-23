---
title: Database
description: The D1 database behind the API, its Drizzle schema, migrations, and rollbacks, and the trip, entry, and history rules every write goes through
---

# Database

## Overview

Owns the local and deployed D1 database, the schema and migrations that shape it, and the calendar rules that read and write it for a person and for the assistant. The routes that call those rules are the subject of `canon/context/web/api.md`.

## Layout

### `worker/db/`

Holds the Drizzle schema, the client a route gets its database from, the migrations `drizzle-kit` writes, and a rollback for each.

- Edit the schema and run `bun run db:generate` for the next migration, since an applied migration is never edited
- Each migration takes a rollback of the same file name under `rollbacks/`, and a spec fails when one is missing or leaves a table behind
- `bun run db:migrate` and `bun run dev` read the same local database under `.wrangler/state/v3/d1`

### `worker/calendar/`

Holds the trip, entry, and history rules the routes call as `person` and the assistant's tools call as `assistant`.

- Every write is one D1 batch opening on its change row, inserted only while the version, range, and id checks hold, and every later statement waits on that row, so a refused check writes nothing
- Rows are soft-deleted, so a read never returns a deleted trip, a deleted entry, or an entry of a deleted trip
- Update and delete take the version the caller read and answer `edit_conflict` on a stale one. Create takes a client id, and a retry with the same body answers the stored row.
- Undo writes a change's `before` back as an `undo` change, refusing `undo_conflict` unless the row still holds that change's `after`, and `already_undone` on a second try
- A trip's zone change moves the entries in its old zone, keeping their clock times, and records which, so undoing it moves the same ones back

## Gotchas

- Storage resets per spec file rather than per test, so a case that writes or rolls back hands its state to the next case in that file
- Drizzle's D1 batch throws on a `db.run()` carrying parameters, so a guarded insert goes through `insertWhen()` in `worker/calendar/record.ts`, with `deferForeignKeys()` ahead of it
