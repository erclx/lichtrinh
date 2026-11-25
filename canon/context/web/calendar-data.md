---
title: Calendar data
description: The app's reads and writes over trips, entries, and changes, on TanStack Query, shared by every calendar screen
---

# Calendar data

## Overview

Owns how the browser app reads and writes the calendar API, from the one query cache down to the hook a screen calls. The screens that render the data are the subject of `canon/context/web/app.md`, and the API behind it is `canon/context/web/api.md`.

## Layout

### `web/calendar-data/`

Holds one module per role, and every calendar screen reads through it rather than calling `apiFetch` itself.

- `api.ts` holds one function per route, each parsing its answer through the `shared/` schema
- `queries.ts` names every query key once in `calendarKeys`, since the offline plan persists the cache under those keys and a renamed one strands what it saved
- `mutations.ts` holds create, update, delete, and undo, each refreshing every key under `calendar` on success, since a write moves totals across days and trips
- `query-client.ts` refreshes a visible screen on focus and every 30 seconds, stops in a hidden tab, and retries a lost answer alone, never a refusal
- A create takes its `id` from the caller, which keeps one for the form's life so a retry after a lost answer reuses it, and an undo takes its `undoId` the same way

### `web/features/changes/`

Holds a trip's Change history page at `/trips/:tripId/history`, built against `canon/design/budget/`'s history frames.

- A row reads by its before and after alone, so an undo reads like any change beside an Undo tag
- A row groups and times on the trip's clock, and an older cost reads in the currency the trip was in then
- A conflict keeps Undo on the row, and its line clears once an undo puts the entry back, since the older change is undoable again
- Undoing a trip's creation removes the trip and this page with it, so it asks first, and the undo status offers the way back
- The undo itself is `web/components/change-undo.ts`, which the chat's change card shares
