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

| Command                | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `bun run dev`          | Serve the app and the API on port 5173, plus the worktree offset           |
| `bun run test:run`     | Run the Vitest unit and component tests once                               |
| `bun run test:e2e`     | Run the Playwright suite in chromium, firefox, and webkit                  |
| `bun run screenshot`   | Build, serve on port 4173, and capture each case in `e2e/capture/cases.ts` |
| `bun run db:generate`  | Write the next migration from `worker/db/schema.ts`                        |
| `bun run db:migrate`   | Apply pending migrations to the local D1 database under `.wrangler/`       |
| `bun run types:worker` | Regenerate the Worker types from `wrangler.jsonc`, which typecheck runs    |

### `cli/`

Holds the `lichtrinh` command for the product's own services, which the owner installs once with `bun link` and runs from any folder. The development loop above stays on `bun run`.

- `program.ts` builds the commander program from an injected output, task runner, and checkout lookup, so tests drive it with no process
- `checkout.ts` picks the git top level of the working folder when it is a lichtrinh checkout, a linked worktree included, else the command's own checkout
- `task.ts` prints `› <command>`, runs it with inherited output, and returns its exit code
- `commands/` holds one file per verb group, starting with `db status` and `db migrate` over the local database

### `voice/`

Holds the Python project, synced from canon's python stack with `--skip base`, so husky, oxfmt, and commitlint stay at the root. It needs [uv](https://docs.astral.sh/uv/) and one `uv sync` inside `voice/`, since `bun run check` runs these too. Run them from inside `voice/`.

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `bun run lint`      | Run `ruff check` and `ruff format --check`           |
| `bun run lint:fix`  | Auto-fix with `ruff check --fix` then `ruff format`  |
| `bun run typecheck` | Run `mypy` in strict mode                            |
| `bun run test:run`  | Run `pytest -v`                                      |
| `bun run test:cov`  | Run `pytest` with branch coverage and an HTML report |

### `.husky/`

Holds the git hooks that run the checks before a commit or a push leaves.

- `pre-commit` runs `lint-staged` (oxfmt on staged files)
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, and also gates on banned characters across every tracked markdown file except `CHANGELOG.md` when a markdown-bans audit tool is on PATH

## Gotchas

- A push fails on formatting drift until `bun run format` runs, since the `pre-push` hook writes nothing
- The root `check` chains into `voice/scripts/verify.ts`, held through every sync by `canon tooling customize package.json:check`, since base overrides that script
- `uv add` in `voice/` writes TOML that root oxfmt rejects, so run `bun run format` at the root after a dependency change
- Local D1 state lives under `.wrangler/state/v3/d1`, and deleting `.wrangler/` resets it until the next `bun run db:migrate`
- `bun link` links the checkout it ran in, so a verb added on a branch stays invisible to `lichtrinh` until it merges and that checkout pulls
