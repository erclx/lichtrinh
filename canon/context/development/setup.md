---
title: Setup
description: Local dev workflow, scripts, and husky hooks
---

# Setup

## Overview

Owns how the project runs on a developer machine, being the toolchain install, the scripts that verify a change, and the git hooks that run them before a commit or a push leaves. CI calls the same scripts from a workflow, which is the CI entry's subject.

Install [Bun](https://bun.sh) with `curl -fsSL https://bun.sh/install | bash` and run `bun install`, then use the package scripts below. They call the shell scripts in `scripts/`, which holds every one since none belongs outside it.

## Layout

### `scripts/`

| Command          | Purpose                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `bun run check`  | Gates locally and writes nothing. Fails on formatting drift until `bun run format` runs. |
| `bun run format` | Auto-fix oxfmt formatting.                                                               |

These run and test the app, its local database, and the generated Worker types.

| Command                | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `bun run dev`          | Serve the app and the API on port 5173, plus the worktree offset        |
| `bun run test:run`     | Run the Vitest unit and component tests once                            |
| `bun run test:e2e`     | Seed a fresh temp database, then run Playwright in three engines        |
| `bun run screenshot`   | Seed a temp database, build, serve on 4173, and capture each case       |
| `bun scripts/seed.ts`  | Migrate and write the invented fixture accounts, safe to run twice      |
| `bun run db:generate`  | Write the next migration from `worker/db/schema.ts`                     |
| `bun run db:migrate`   | Apply pending migrations to the local D1 database under `.wrangler/`    |
| `bun run types:worker` | Regenerate the Worker types from `wrangler.jsonc`, which typecheck runs |

### `cli/`

Holds the `lichtrinh` command for the product's own services, which the owner installs once with `bun link` and runs from any folder. The development loop above stays on `bun run`.

- `program.ts` builds the commander program from an injected output, task runner, and checkout lookup, so tests drive it with no process
- `checkout.ts` picks the git top level of the working folder when it is a lichtrinh checkout, a linked worktree included, else the command's own checkout
- `task.ts` prints `› <command>`, runs it with inherited output, and returns its exit code
- `commands/` holds one file per verb group, being `db` over the local database, `admin`, whose `create --remote` asks before it writes, `voice` over `uv run --group gpu`, and `bridge`, below
- `admin/` makes the first admin, as `lichtrinh admin create <username> --local` after `bun run db:migrate`. It prints the password once, and the operator's own account passes `--language en`.

### `bridge/`

Holds the process the workspace PC runs beside Ollama, which dials out to the app's relay and answers chats with a local model. It imports `shared/` alone, writes nothing to disk, and logs ids and durations, never message text.

- Upgrade Ollama, then run `lichtrinh bridge models` to make the `lichtrinh-assistant` and `lichtrinh-assistant-gemma` aliases from `bridge/models/`
- Put `LICHTRINH_URL` and `BRIDGE_SECRET` in `~/.config/lichtrinh/bridge.env`, source it, and start `lichtrinh bridge run`. The secret matches the Worker's, a `.dev.vars` line locally.
- `bun run dev` passes the socket upgrade through to the relay, so `LICHTRINH_URL=http://localhost:5173` plus the worktree offset serves a local run
- `lichtrinh bridge eval` scores an alias live on the invented asks in `bridge/fixtures/requests.json` and exits non-zero under 26 of 30
- `turn.ts` is the tool loop, capped at six rounds and 110 seconds. It sends every tool call up to the relay and refuses a second removal in a turn unless it held the turn before for a yes.

### `voice/`

Holds the Python project, synced from canon's python stack with `--skip base`, so husky, oxfmt, and commitlint stay at the root. It needs [uv](https://docs.astral.sh/uv/) and one `uv sync` inside `voice/`, since `bun run check` runs these too. Run the `bun run` rows from inside `voice/`.

| Command                             | Purpose                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `bun run lint`                      | Run `ruff check` and `ruff format --check`                                                |
| `bun run lint:fix`                  | Auto-fix with `ruff check --fix` then `ruff format`                                       |
| `bun run typecheck`                 | Run `mypy` in strict mode                                                                 |
| `bun run test:run`                  | Run `pytest -v`                                                                           |
| `bun run test:cov`                  | Run `pytest` with branch coverage and an HTML report                                      |
| `lichtrinh voice models`            | On the workspace PC after `uv sync --group gpu`, fetch every model and convert PhoWhisper |
| `lichtrinh voice serve`             | Serve on `127.0.0.1:8770`, one model at a time, unloaded after `VOICE_IDLE_SECONDS`       |
| `lichtrinh voice transcribe <path>` | Send one clip to the running server and print its text and timings                        |

### `.husky/`

Holds the git hooks that run the checks before a commit or a push leaves.

- `pre-commit` runs `lint-staged` (oxfmt on staged files)
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, and also gates on banned characters across every tracked markdown file except `CHANGELOG.md` when a markdown-bans audit tool is on PATH

## Gotchas

- A push fails on formatting drift until `bun run format` runs, since the `pre-push` hook writes nothing
- The root `check` finds `voice/` through its tracked `scripts/verify.json` and runs it as a nested root, so a second call to it in the `check` script runs the voice checks twice
- `uv add` in `voice/` writes TOML that root oxfmt rejects, so run `bun run format` at the root after a dependency change
- Local D1 state lives under `.wrangler/state/v3/d1`, or below `LICHTRINH_STATE_ROOT` when set, which keeps e2e, captures, and drives off the developer's database
- `bun link` links the checkout it ran in, so a verb added on a branch stays invisible to `lichtrinh` until it merges and that checkout pulls
