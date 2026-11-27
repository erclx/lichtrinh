---
title: Dev command
description: The lichtrinh dev verb, which checks the checkout's packages and then hands off to the dev run
---

# Dev command

## Overview

Owns `lichtrinh dev`, the owner's way to start the dev run from any folder. The run itself is the setup entry's, at `canon/context/development/setup.md`, and this verb only checks the checkout and hands off.

## Layout

### `cli/dev/`

Holds the package check `lichtrinh dev` runs before it starts anything. The verb runs `bun run dev:full`, or `bun run dev:phone` with `--phone`, and passes `--reset` through unchanged.

- A package counts as stale when `node_modules/` lacks it or holds it at a version other than the one `bun.lock` records, so a checkout behind a merge stops before the run with a `bun install` line
- `bun.lock` is JSON with trailing commas, so each top-level entry is read by its line. A lockfile it cannot read names every package rather than passing.

## Gotchas

- The main checkout's packages fall behind each merge that adds or bumps one, until a `bun install` there, and `lichtrinh dev` is what names them
