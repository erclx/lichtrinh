---
title: CI
description: GitHub Actions workflow triggers and checks
---

# CI

## Overview

Owns the GitHub Actions workflow that gates a merge, being which events start a run and which checks have to pass before the branch can land. The checks call package scripts rather than defining commands of their own, so what each one runs is the setup entry's subject.

## Layout

### `.github/workflows/`

Holds `verify.yml` and `voice.yml`, the workflows that gate a merge, beside three that gate nothing. A pull request targeting `main` starts both, and so does a manual `workflow_dispatch` run from the Actions tab.

- Every job must pass before merge
- `🎭 E2E Tests` passes only when both Chromium shards did, and the ruleset requires that name alone, since a shard's name changes with the count
- `release-please.yml` keeps a release pull request open on every push to `main` and tags the release when it merges
- `verify.yml`, `phase-label-gate.yml`, and `pr-local-preview.yml` come from the toolkit's stacks and are rewritten on each sync, so edit them in the toolkit
- `voice.yml` runs `uv sync --locked`, then the typecheck, lint, and test scripts in `voice/`. No stack ships it, so sync leaves it alone, and it installs no speech model or GPU wheel.

## Gotchas

- A push skips the full unit run and the build, so `bun run check` is the local run that can reproduce a red Unit Tests or Build job
- The Format check runs `bun run check:format`, the same assert `bun run check` makes, so fix a failure by committing what `bun run format` writes
