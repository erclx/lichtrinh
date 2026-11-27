---
description: Place each product service and dev run the owner starts by hand behind a lichtrinh verb, and keep the rest of the development loop on bun run
paths:
  - 'cli/**/*.ts'
  - 'package.json'
---

# CLI standards

## Verbs

- Give each product service the owner runs by hand a `lichtrinh` verb, registered from its own file under `cli/commands/`, such as `admin`, `bridge`, or `voice`.
- Keep `preview`, `test`, and `check` as `bun run` scripts alone, never as `lichtrinh` verbs, since the command is for what the owner runs by hand.
- Give a dev script the owner runs by hand a verb only as a wrapper, such as `lichtrinh dev` over `dev:full`, that checks first and hands off to `bun run` unchanged.
- Settle a group's name in the row that adds it, since a rename reaches every later plan and the owner's muscle memory.

## Hand-off

- Hand each verb's work to a package script, `wrangler`, or `uv run` through the runner `cli/program.ts` passes in, never re-implementing what that task does.
- Run every task in the checkout `cli/checkout.ts` resolves, never in `process.cwd()` directly, so a linked worktree acts on its own state.
- Exit with the task's own code, never 0 after a failure.

## Reach

- Keep remote database work in CI, adding a hand-run remote verb only with its own confirm step.
