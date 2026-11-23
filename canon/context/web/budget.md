---
title: Budget
description: A trip's estimated cost, the exchange rates the admin sets, and the home-currency figure read from them
---

# Budget

## Overview

Owns what a trip costs and what that comes to at home, from the money math in `shared/` to the Budget page, the admin's rates page, and the "about" figure the overview and the day view show. The calendar screens it reads from are the subject of `canon/context/web/app.md`, and the API behind it is `canon/context/web/api.md`.

## Layout

### `shared/`

Holds the money math the app reads now and the assistant's tools can import to answer cost questions.

- `budget.ts` totals a trip in its own minor unit, per kind and per trip day, counting an entry on the day it starts and counting an uncosted entry apart
- `rates.ts` keeps a rate as a decimal string, never a number, and converts on `BigInt` with a half rounding up, inverting a pair stored only the other way round

### `worker/routes/rates.ts`

Holds the rates under `rate:<FROM>:<TO>` keys of the `settings` table, beside the contact name, so neither read sees the other's rows.

- `GET /api/rates` answers anyone signed in, and the writes sit under `/api/admin/rates/:from/:to`
- Setting a pair deletes its reverse in the same batch, so one stored rate answers both directions, and clearing removes either spelling

### `src/features/budget/`

Holds the trip's Budget page at `/trips/:tripId/budget`, built against `canon/design/budget/`'s trip frames.

- An entry of no kind takes the muted ink in the bar and the legend, since a pastel names a kind and nothing else
- The figure beside a total is `src/components/home-estimate.tsx`, which renders nothing with no rate or when both currencies match

### `src/features/rates/`

Holds the admin's rates page at `/admin/rates`, opened from the Exchange rates row in Settings.

- It lists each pair a trip needs, home currency first, plus every stored pair, once whichever way round it was stored
- The field reads the active language's own group and decimal marks, so `25.500,5` is a rate in Vietnamese
- The rates read and its writes sit in `src/calendar-data/rates.ts` under the `calendar` cache key, so an offline reader keeps the figure
