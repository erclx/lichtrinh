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

| Command                 | Purpose                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun run check:changed` | Gates a push with the static checks and the tests tied to the change, skipping an untouched `voice/` |
| `bun run check`         | Runs every check, the full unit run, the build, and the voice checks by hand. Neither check writes.  |
| `bun run format`        | Auto-fix oxfmt formatting.                                                                           |

These run and test the app, its local database, and the generated Worker types.

| Command                | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| `bun run dev`          | Serve the app and the API on port 5173, plus the worktree offset            |
| `bun run dev:full`     | Seed `.wrangler/dev/`, start the app, voice, and the bridge, stop on Ctrl-C |
| `bun run test:run`     | Run the Vitest unit and component tests once                                |
| `bun run test:e2e`     | Seed a fresh temp database, then run Playwright in Chromium                 |
| `bun run screenshot`   | Seed a temp database, build, serve on 4173, and capture each case           |
| `bun scripts/seed.ts`  | Migrate and write the invented fixture accounts, safe to run twice          |
| `bun run db:generate`  | Write the next migration from `worker/db/schema.ts`                         |
| `bun run db:migrate`   | Apply pending migrations to the local D1 database under `.wrangler/`        |
| `bun run types:worker` | Regenerate the Worker types from `wrangler.jsonc`, which typecheck runs     |

### `scripts/dev/`

Holds `bun run dev:full`, the owner's way to try the whole app at any time on invented data. It runs the app, voice, and the bridge as children of one process and stops all three on one Ctrl-C. The table sets it beside every other run, and only staging and production leave this machine.

| Run                  | Runs on                                   | Its data                                               |
| -------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `bun run dev`        | Vite and workerd on this machine          | `.wrangler/state/`, or below `LICHTRINH_STATE_ROOT`    |
| `bun run dev:full`   | Vite, workerd, voice, and the bridge here | `.wrangler/dev/` in the checkout, kept until `--reset` |
| `bun run test:run`   | Vitest, with the API inside workerd       | A fresh in-memory D1 per test file                     |
| `bun run test:e2e`   | Playwright against `bun run dev`          | `lichtrinh-e2e-<offset>/` under the temp folder, wiped |
| `bun run screenshot` | A built preview on port 4173              | A fresh `mktemp -d` folder for each run                |
| Staging              | Cloudflare, on each merge to `main`       | Its own remote D1 database, invented rows alone        |
| Production           | Cloudflare, on each release               | Its own remote D1 database, the family's trips         |

The run seeds, checks, and stops in the ways below.

- It seeds the 2031 fixtures plus a trip around today with `bun scripts/seed.ts --today`, which no test or capture passes, so their frames stay on 2031
- A rerun keeps the database and the owner's edits in it, and `bun run dev:full --reset` removes `.wrangler/dev/` first
- It checks `uv`, Ollama with both `lichtrinh-assistant` aliases, the speech models, a free app port, and that no `.dev.vars` exists, and starts nothing until each holds
- The Worker and the bridge share a secret made for the run and passed through the environment, and the bridge dials `localhost` whatever `LICHTRINH_URL` the shell holds
- Each child runs in its own process group, so Ctrl-C reaches Vite and workerd too, and any child exiting stops the rest. A voice server already on 8770 is reused and left running.

### `cli/`

Holds the `lichtrinh` command for the product's own services, which the owner installs once with `bun link` and runs from any folder. The development loop above stays on `bun run`.

- `program.ts` builds the commander program from an injected output, task runner, and checkout lookup, so tests drive it with no process
- `checkout.ts` picks the git top level of the working folder when it is a lichtrinh checkout, a linked worktree included, else the command's own checkout
- `task.ts` prints `› <command>`, runs it with inherited output, and returns its exit code
- `commands/` holds one file per verb group, being `db`, `admin`, whose remote flags ask before writing, `voice`, `bridge`, below, and `panel`, at `canon/context/development/panel.md`
- `admin/` makes the first admin, as `lichtrinh admin create <username> --local` after `bun run db:migrate`. It prints the password once, and the operator's own account passes `--language en`.

### `bridge/`

Holds the process the workspace PC runs beside Ollama, which dials out to the app's relay and answers chats with a local model. It imports `shared/` alone, writes nothing to disk, and logs ids and durations, never message text.

- Upgrade Ollama, then run `lichtrinh bridge models` to make the `lichtrinh-assistant` and `lichtrinh-assistant-gemma` aliases from `bridge/models/`
- Put `LICHTRINH_URL` and `BRIDGE_SECRET` in `~/.config/lichtrinh/bridge.env`, source it, and start `lichtrinh bridge run`. The secret matches the Worker's, a `.dev.vars` line locally.
- `bun run dev` passes the socket upgrade through to the relay, so `LICHTRINH_URL=http://localhost:5173` plus the worktree offset serves a local run
- `lichtrinh bridge eval` scores an alias live on the invented asks in `bridge/fixtures/requests.json` and exits non-zero under 26 of 30 in Vietnamese or 5 of 6 in English
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

The server also steps a clip still being spoken, through `PUT /v1/live/<id>`.

- `live.py` holds at most four turns in memory, appends a piece only where the last one ended, and drops a turn 15 seconds untouched, so a worker stays stateless
- A live step answers nothing while a clip or a load holds the worker, and a model not loaded starts loading behind it
- `workers/steps.py` holds each family's step rule with its model calls passed in, so the rules run in CI. Qwen continues its own text, and the Whisper models cut at pauses.
- Every transcription, live or whole, runs `workers/speech.py` first and answers empty text when nobody speaks

### `.husky/`

Holds the git hooks that run the checks before a commit or a push leaves.

- `pre-commit` runs `lint-staged` (oxfmt on staged files)
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check:changed`, and also gates on banned characters across every tracked markdown file except `CHANGELOG.md` when a markdown-bans audit tool is on PATH

### `canon/config/`

Holds the toolkit settings. `config.json` marks the files below customized, so a sync leaves each alone and reports when the toolkit copy moves.

- `vite.config.ts` adds the Worker, the offline build, the state root, and staging's names, and `vitest.config.ts` adds a project per runtime
- `playwright.config.ts` adds the seeded state root, the test bridge secret, the fake microphone, and the owner panel's project
- `tsconfig.json` adds the `@shared/*` alias, and `.oxfmtrc.json` ignores the generated migration files and the design assets
- The `typecheck` script generates the Worker types first, and `screenshot` seeds a temp database
- In `voice/`, `mypy.ini` and `pytest.ini` keep the project's own settings, and the placeholder smoke test is declined

## Gotchas

- A push fails on formatting drift until `bun run format` runs, since the `pre-push` hook writes nothing. It skips content that already passed, so run `bun run check:changed --force` after a reinstall.
- The root `check` finds `voice/` through its tracked `scripts/verify.json` and runs it as a nested root, so a second call to it in the `check` script runs the voice checks twice
- `uv add` in `voice/` writes TOML that root oxfmt rejects, so run `bun run format` at the root after a dependency change
- Local D1 state lives under `.wrangler/state/v3/d1`, or below `LICHTRINH_STATE_ROOT` when set, which keeps e2e, captures, and drives off the developer's database
- `bun link` links the checkout it ran in, so a verb added on a branch stays invisible to `lichtrinh` until it merges and that checkout pulls
