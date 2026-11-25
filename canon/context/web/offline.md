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
- The dev server and Playwright's e2e run register no worker, so Push reads unsupported there, so `e2e/offline.spec.ts` cuts the API and reloads, and the worker's own reload is checked on a build
