---
title: CI
description: GitHub Actions workflow triggers and checks
---

# CI

## Overview

Owns the GitHub Actions workflow that gates a merge, being which events start a run and which checks have to pass before the branch can land. The checks call package scripts rather than defining commands of their own, so what each one runs is the setup entry's subject.

## Layout

### `.github/workflows/`

Holds `verify.yml` and `voice.yml`, the workflows that gate a merge, beside four that gate nothing. A pull request targeting `main` starts both, and so does a manual `workflow_dispatch` run from the Actions tab.

- Every job must pass before merge
- The Format check runs `bun run check:format` and asserts oxfmt is clean
- `release-please.yml` keeps a release pull request open on every push to `main` and tags the release when it merges
- `phase-label-gate.yml`, `pr-local-preview.yml`, and `readme-screenshot.yml` come from the toolkit's stacks and are rewritten on each sync, so edit them in the toolkit
- `voice.yml` runs `uv sync --locked`, then the typecheck, lint, and test scripts in `voice/`. No stack ships it, so sync leaves it alone, and it installs no speech model or GPU wheel.

`readme-screenshot.yml` checks out with the release workflow's `RELEASE_PLEASE_TOKEN` fallback, so its bot commit triggers the required checks instead of waiting on first-time contributor approval.

## Gotchas

- `bun run check` runs the same assert as CI and writes nothing, so a CI format failure is fixed by running `bun run format` locally and committing the diff
