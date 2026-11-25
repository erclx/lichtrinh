---
title: API
description: The Worker serving the app and the Hono API, its sign-in, the assistant relay and voice, and the schemas the app and the API share
---

# API

## Overview

Owns the Cloudflare Worker that serves the built app and answers `/api/*`, and the zod schemas both sides parse with. The D1 database and the calendar rules over it are the subject of `canon/context/web/database.md`, and the React front end it serves is `canon/context/web/app.md`.

## Layout

### `worker/`

Holds the Worker entry and the Hono app mounted on `/api`. The root `wrangler.jsonc` sends only `/api/*` to the Worker first, so every other path, client routes included, answers the app shell.

- Every failure answers `{ error: { code, message } }` from `shared/errors.ts`, and a caller branches on `code` alone
- A thrown error answers `internal_error` and logs the route and the error class, never its message, which can carry SQL or text a person typed
- A body past 64 KB gets `body_too_large` before any route reads it. The clip and live routes under `/api/voice` alone take 2 MiB, matched on their method and whole path.
- Specs run inside workerd as the `worker` Vitest project, calling `app.request(path, init, env)` with no server running

### `worker/auth/`

Holds sign-in and the guard every route sits behind. The app runs the body limit, then `csrf()`, then a check that answers `415 unsupported_media_type` to any unsafe-method body other than JSON or an empty one, then the guard. The clip and live routes pass `audio/webm` and `audio/mp4` too, and every other route still refuses them.

- `guard.ts` lets a signed-out caller reach health, sign-in, and the bridge's `GET /api/bridge/connect` alone, so a new route, an unknown path included, answers `401 unauthenticated`
- `guard.ts` puts `user` and `sessionId` on the Hono context. `requireAdmin` answers `403 forbidden` on `/api/admin/*`, and `requireChat` does so for an account whose `canChat` is off.
- `session.ts` issues a 180-day `__Host-session` cookie, stores only the SHA-256 of its token, and slides the expiry at most once a day
- `attempts.ts` refuses past 10 failures per username or 50 per `CF-Connecting-IP` in 15 minutes. Only the edge sets that header, so a local spec counting failures passes its own.
- `password.ts` verifies PBKDF2 hashes from `shared/password-hash.ts`, whose exception to the installed hash rule is `.claude/rules/project/code/passwords.md`

### `worker/assistant/`

Holds the chat store, the calendar tools, and the `AssistantRelay` Durable Object. The workspace PC's bridge dials into the relay and runs the model there, and the relay runs every tool call here as the chat's owner.

- `relay.ts` keeps the bridge socket through the hibernation API and holds one turn at a time. A second send answers `409 assistant_busy`, and no live socket answers `503 assistant_unavailable`.
- A turn streams NDJSON chat events to the send's response and saves the reply on `final`. A dropped socket, a cancel, or the 120-second backstop saves it `failed` or `stopped` with the changes it made.
- `tools.ts` parses each call against `shared/assistant-tools.ts` and writes with the version the turn's prompt showed, so an entry a person edited mid-turn answers `edit_conflict` to the model
- `chats.ts` binds a new chat to the trip under way, else the next, else the latest. A reply names the message it answers in `reply_to`, so a retried send answers the saved reply.
- The bridge proves itself with `BRIDGE_SECRET` as a bearer token, compared in constant time. It lives in Wrangler secrets and `.dev.vars`, and `worker/test/env.d.ts` declares its type for CI.

### `worker/voice/`

Holds the speech model setting, the language an account speaks and is answered in, and the `transcriptions` record the admin ranks models by. A clip rides the bridge socket as base64 in a `transcribe` frame, so the workspace PC opens no port for voice.

- The relay sends a clip only to a bridge whose hello said `voice` and whose last `voice_status` read online, and answers `503 voice_unavailable` otherwise
- A clip waits up to 60 seconds beside the running turn, never behind it, and a socket closing with one pending answers `502 voice_failed` at once
- `PUT /api/voice/live/:id` puts a piece of a clip still being spoken to a bridge that said `live_ready`, waiting 5 seconds. It writes no row and logs no line, and its id carries the account.
- A clip takes the account's language, Vietnamese when unset, and the default model when the picked one cannot hear it. Only such a bridge is told the language, as an older one drops a clip naming it.
- A row holds the outcome, the timings, the transcript's length, never its text, and the model that ran. A send carrying `voice` marks the sender's own row with the edit ratio measured.

### `worker/notices/`

Tells each admin once per outage that the assistant or voice is off, by push, email, or both. Each admin turns push on per device and saves one email address, through `/api/admin/notices`.

- `outage.ts` claims an outage in one upsert, releases it when every send fails, and frees a crashed one after 30 seconds. It ends at the up time the relay stores, so a silent socket is closed.
- `recipients.ts` reads role and session on every send, so a demotion, a sign-out, or an expiry stops a notice
- `push.ts` posts only to a fixed list of push services and follows no redirect, since a saved endpoint is an address the Worker calls
- `email.ts` sends as the `NOTICE_FROM` secret. An unset sender or VAPID key takes its row off the page, and no refusal code fails a request.
- No read answers an endpoint, a key, or another admin's address, and a log line carries ids, the kind, and a count

### `shared/`

Holds the schemas the app, the API, and the assistant's tools all import as `@shared/*`, plus the password hash and generator the Worker and the admin command share. The import direction between it, `web/`, and `worker/` is `.claude/rules/project/code/imports.md`.

- The root typecheck has no Worker types, so a binding type written here fails `bun run typecheck`

### Other folders

The Worker's two smaller folders each carry one job.

- `worker/routes/`: one Hono router per area, being health, auth, users, backup, settings, rates, trips, entries, changes, chats, voice, notices, and the assistant with its bridge socket
- `worker/routes/backup.ts` answers the file `shared/backup.ts` versions. `readBackup` in `worker/calendar/backup.ts` makes two queries, since the free plan caps a request at 50.
- `worker/routes/users.ts` edits an account in one `UPDATE` that counts admins itself, since a separate count lets two demotions both pass
- `worker/test/`: the migrating setup, the test-only binding types, and builders for invented records, requests, and a scripted fake bridge. `bare()` sends the Origin `csrf()` needs on a bodiless POST.

## Gotchas

- `worker/worker-configuration.d.ts` is generated and gitignored, and `bun run typecheck` regenerates it before compiling the Worker
- `vitest.config.ts` merges `vite.config.ts`, so `cloudflare()` loads in both test projects. Suspect it first when `bun run test:run` hangs after a plugin upgrade.
- Coverage runs on V8, which Cloudflare's known-issues page calls unsupported. Switch to Istanbul and exclude `worker/db/migrations/` if CI reports `worker/` at zero.
