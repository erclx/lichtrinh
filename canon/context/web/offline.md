---
title: Offline
description: The service worker, the plan saved on the device, and the card and waiting controls the app shows while it cannot reach the API
---

# Offline

## Overview

Owns what keeps the last loaded plan readable with no connection, from the service worker holding the built app to the calendar cache saved on the device. The cache it saves is the one `canon/context/web/calendar-data.md` describes, and the session status it reads is in `canon/context/web/app.md`.

## Layout

### `web/offline/`

Holds the device-side cache and the offline state, one role every calendar screen reads.

- `persist.ts` saves every calendar read to `localStorage` under `lichtrinh.calendarCache` for 7 days, dropped when another app version saved it, and `clearCalendarCache` forgets it on sign-out
- `connection.ts` reads offline as the browser's flag or any API call that got no answer, through `onReach` in `web/lib/api.ts`, so a connection with no internet behind it still counts
- `offline-card.tsx` is the card from `canon/design/states/offline`, naming the saved time on the device's clock, and exports the reason id and the muted look each waiting control takes
- Add, Edit, Delete, Undo, the Talk bar, and the message row stay on screen offline and say they wait
- A write already started fails at once to the save error, since mutations run with `networkMode: 'always'`

### `vite.config.ts`

Builds the service worker through `vite-plugin-pwa`, which `web/main.tsx` registers in production alone.

- It precaches the built app and answers every navigation with `index.html`, leaving `/api/` to the network so no cached answer outlives a sign-out
- The same call takes the home-screen manifest from `pwa-manifest.ts`, staging's under `CLOUDFLARE_ENV=staging`, which a build links and precaches and the dev server never serves
- The built worker imports `web/public/push-handler.js` by name, outside the precache, so it meets payloads of another version and shows something for each
- It sets `skipWaiting` and `clientsClaim` by hand, since the plugin leaves both unset under `injectRegister: false`, so a new release takes over without every window closing
- The dev server and Playwright's e2e run register no worker, so Push reads unsupported there, so `e2e/offline.spec.ts` cuts the API and reloads

### `web/update/`

Moves an open page onto a release once its worker takes over, at a moment nothing is lost.

- `follow-releases.ts` registers the worker from `web/main.tsx`, in production alone, and passes an empty `onNeedReload`, so the plugin never reloads every window itself
- It asks for an update on every show, since a resumed app asks for none until a load, and reads each takeover from `controllerchange`, since the plugin stops listening after one
- `take-release.ts` reloads only when the `index.html` the worker saves names another entry script than the page runs, so a missed activation still moves and one reload settles it
- An untouched page moves at the takeover, a tapped one on its next show or on the next screen, which `web/shell/app-shell.tsx` reports

### What holds a reload

A reload waits while it would lose something, in this window or another.

- `web/update/holds.ts` keeps the page while any form is on screen, while a form spreading `safeWhenEmpty` holds text, and while a `hold()` or `useHold` stands
- The composer and sign-in are the forms marked safe. A recording, a turn from send to the end of its stream, a password shown once, and an undo notice each hold.
- A page left on the old release runs under the new worker with its files gone from the precache, which holds only while every route loads eagerly. A lazily loaded route would break it.
- `e2e/update.spec.ts` checks each moment over two releases that `e2e/release-server.ts` builds without the Cloudflare plugin, since that plugin points `.wrangler/deploy/config.json` at its last build
