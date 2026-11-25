---
title: Deploy
description: The staging and production copies on Cloudflare, the workflow that updates them, the rollback, and the operator's one-time setup
---

# Deploy

## Overview

Owns how the Worker reaches Cloudflare as two copies, staging on invented data and production on the family's. Each copy has its own Worker, D1 database, Durable Object, host, and secret, named in the `env` blocks of `wrangler.jsonc`. The workflows that gate a merge are the subject of `canon/context/development/ci.md`.

## Layout

### `scripts/deploy/`

Holds the run `.github/workflows/deploy-worker.yml` starts. A push to `main` tests and deploys staging, and a push that moved `.release-please-manifest.json` then deploys production. A pull request validates both copies with no secret. The operator takes each step below, once per copy where it names one.

| Step                                                                                                    | When                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------- |
| The `main` ruleset switched on, since a push to `main` deploys staging                                  | Before the first deploy       |
| An API token from "Edit Cloudflare Workers" plus D1 edit, limited to one account and one zone           | Before the first deploy       |
| `wrangler d1 create lichtrinh-<copy>`, with the id put in `wrangler.jsonc`                              | Before the first deploy       |
| A GitHub environment admitting `main` alone, holding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` | Before the first deploy       |
| `wrangler secret put BRIDGE_SECRET --env <copy>`, a new value for each                                  | Right after the first deploy  |
| `lichtrinh admin create <username> --staging`, neither `admin` nor `traveler`, or `--remote`            | After the first deploy        |
| `gh workflow run deploy-worker.yml -f drill_rollback=true`, which rolls back and ends red by design     | After the first deploy        |
| `wrangler d1 time-travel restore DB --env <copy> --bookmark <point>`                                    | Last resort, loses new writes |

Each run, and the copies it leaves, work in the ways below.

- `run.ts` logs the serving version and a D1 restore point, then migrates, deploys, seeds staging, and smoke-checks. A real run refuses to start outside GitHub Actions.
- A failed smoke check rolls back to the logged version and ends red. A check Cloudflare challenged ends red too and rolls nothing back, since the app was never reached.
- `staging-seed.ts` adds the missing fixtures and a trip around today to the database the `staging` block names, and takes no target. Its accounts have no password until the admin resets one.
- A release whose staging job ends red never reaches production. Rerun that job before the next merge, or cut a new release, since a late rerun puts older code on staging.
- The staging bridge runs by hand beside production's, with its own settings file naming the staging host and that copy's secret

### `wrangler.jsonc`

Names each copy's bindings, `EMAIL` among them. Notices stay off until the operator takes these steps, once per copy, and either way can be left out. The page drops Email without `NOTICE_FROM`, and Push without both keys. A new key pair ends every device's push until its admin chooses Off, then On.

| Step                                                                                                           | Turns on |
| -------------------------------------------------------------------------------------------------------------- | -------- |
| Onboard the copy's own host as a sending domain in Cloudflare Email Service                                    | Email    |
| `wrangler secret put NOTICE_FROM --env <copy>`, an address on that host                                        | Email    |
| Add each admin's address as a destination address, and confirm it from the email Cloudflare sends              | Email    |
| `bunx web-push generate-vapid-keys`, then `wrangler secret put` for `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` | Push     |

## Gotchas

- A Wrangler command from a logged-in machine reaches the live account, so add `--dry-run` or `--local` to any run meant to stay here
- Setting `BRIDGE_SECRET` before a first deploy creates a placeholder Worker as the rollback target, and left unset it keeps the assistant off
- Cloudflare refuses a rollback past a change to `migrations` in `wrangler.jsonc`, so such a change ships in a pull request of its own
- A rollback leaves migrated schema under old code, so a migration only adds, and a column drops once no release reads it
- A first deploy can end red while its certificate is issued, with nothing to roll back to, so rerun the job a few minutes later
