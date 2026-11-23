---
title: Calendar data
description: The app's reads and writes over trips, entries, and changes, on TanStack Query, shared by every calendar screen
---

# Calendar data

## Overview

Owns how the browser app reads and writes the calendar API, from the one query cache down to the hook a screen calls. The screens that render the data are the subject of `canon/context/web/app.md`, and the API behind it is `canon/context/web/api.md`.

## Layout

### `src/calendar-data/`

Holds one module per role, and every calendar screen reads through it rather than calling `apiFetch` itself.

- `api.ts` holds one function per route, each parsing its answer through the `shared/` schema
- `queries.ts` names every query key once in `calendarKeys`, since the offline plan persists the cache under those keys and a renamed one strands what it saved
- `mutations.ts` holds create, update, delete, and undo, each refreshing every key under `calendar` on success, since a write moves totals across days and trips
- `query-client.ts` refreshes a visible screen on focus and every 30 seconds, stops in a hidden tab, and retries a lost answer alone, never a refusal
- A create takes its `id` from the caller, which keeps one for the form's life so a retry after a lost answer reuses it, and an undo takes its `undoId` the same way
