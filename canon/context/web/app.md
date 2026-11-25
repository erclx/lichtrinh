---
title: App
description: The React front end, its Tailwind styling and shadcn kit, and where its tests and screenshots live
---

# App

## Overview

Owns the browser app the traveler and the family open, from `index.html` and `web/` down to the shared UI kit. The Worker serving it and the API are the subject of `canon/context/web/api.md`, and the chats with the assistant, the mic included, are `canon/context/web/chat.md`.

## Layout

### `web/`

Holds the React entry and the route table. `main.tsx` loads `web/i18n/setup.ts` and mounts `App` from `app.tsx`, and `index.css` holds the color roles, the font, the type steps, the 64px `--spacing-target`, and the radius roles `canon/DESIGN.md` describes.

- `app.tsx` renders `SessionProvider`, then the query cache from `canon/context/web/calendar-data.md`, then `UndoProvider`, around a data router built once from `router.tsx`
- `router.tsx` is the one route table, the session gate over the shell over every page, gathering each feature's `routes.tsx` by glob, so a page is added there and never here
- Light values sit on `:root` and dark on `:root[data-theme='dark']`, which the head script in `index.html` sets and the `dark:` variant reads
- Tailwind v4 runs through `@tailwindcss/vite`, so there is no `tailwind.config` file

### `web/i18n/`

Holds the translation layer every screen reads its copy through, on i18next and react-i18next, with one `translation` namespace.

- `locales/en/` is the shape source, one file per copy block plus one line in its `index.ts`, and each `locales/vi/` block satisfies its slice of `Messages`, so a key in one alone fails `tsc`
- `language.ts` picks a device choice first, then the account's, then Vietnamese in production and English in development, and never the browser's
- `setup.ts` keeps `<html lang>` in step, and its `chooseLanguage` stores a press while `applyLanguage` never does
- `format.ts` holds the `Intl` formatters, each taking the language from `useLanguage()`, and formats a `YYYY-MM-DD` day in UTC so the device zone never moves it

### `web/session/`

Holds app-wide sign-in state, the role `web/i18n/` holds for language, so a feature reads it without importing another feature.

- `provider.tsx` loads `GET /api/auth/me` and keeps `loading`, `signed-out`, `signed-in`, `unreachable`, or `offline`, the last two kept apart so an offline person is not signed out
- `offline` is a lost answer on a device remembering `lichtrinh.lastUser`, and every way to `signed-out` forgets that person and calls `onSignedOut`, which clears the saved plan
- `session-context.ts` exports `useSession()`, and the account's language applies only where the device holds no stored choice
- `gate.tsx` renders the sign-in card, the retry page, or the shell at the path asked for, and `require-admin.tsx` shows a member the not-found page

### `web/shell/`

Holds the frame around every signed-in page, built against `canon/design/shell/`.

- `app-shell.tsx` owns the `main` landmark and the breakpoints, phone under 480, tablet to 1023, and desktop from 1024, plus the chat places
- `nav.tsx` draws the desktop sidebar, the tablet rail, and the phone tabs, and a new place is one entry in `destinations.ts`, never markup there
- A page renders its own `page-header.tsx` and content

### `web/features/`

Holds one folder per screen area, each importing the session and the shell and naming its pages in a `routes.tsx`, with `adminRoutes` behind the admin check. Today renders the day's view, and no other feature imports another.

- `sign-in/`, `accounts/`, and `settings/` are the card, the admin's account pages, and settings with Exchange rates, where `appearance.ts` keeps Auto, Light, or Dark under `lichtrinh.theme`
- `assistant-settings/` is the admin's page for the workspace PC's status, the assistant and speech models with each speech model's usage, and the offline contact name
- `trips/` holds the list, the form, and the overview, and `today/` picks the trip under way in its own zone
- `day/` holds the day page, and `calendar/` the Calendar tab, its view, date, and trip held in the address, with `calendar-range.ts` laying each trip over the month and week
- `entries/` holds the detail, the shared add and edit form, its prefill and cost parsing, and the start times and lengths, and `install/` the home-screen steps and the held browser prompt

### `web/components/`

Holds the app's own components, being the mark, the language toggle, the pickers, the kind icons, the day list with its entry states and swipe row, the delete sheet, the save error, and the undo status, beside the shadcn kit on Base UI in `ui/`.

- Add a kit component with `bunx --bun shadcn@latest add <component>`, and edit it in place
- `picker-sheet.tsx` opens a drawer under 480px and a dialog above, and `sheet-list.tsx` is the one select, filtering without diacritics
- `day-state.ts` marks each entry done, now, or upcoming on its zone's clock, and `swipe-row.tsx` reveals Delete under 1024px, never the only route to it
- The undo status sits clear of the Talk bar at every width, since the bar shows wherever the dock is closed

### Other folders

The folders below each carry one small job.

- `web/lib/`: `cn`, the day helpers, the zone label, and `api.ts`, whose `apiFetch` parses through a `shared/` schema, throws `ApiFailure`, and sends a `blob` raw under its type
- `web/hooks/`: `useMediaQuery`, unmatched in the test DOM, and `useNow`, beside `web/public/` holding the icons and social cards
- `web/test/`: `fake-api.ts` behind `fetch`, invented builders, `media.ts` for a fake recorder and microphone, and `render-route.tsx`
- `e2e/`: the Playwright specs and the screenshot harness, with one case file per feature in `e2e/capture/cases/`, shared setup in `e2e/capture/page-setup.ts`, and frames in `e2e/evidence/`
- `canon/design/`: the accepted frames, written by `bun run design:sync` from `frames.json` and never by hand

## Gotchas

- `bun run screenshot` refuses when port 4173 is taken, often by a Frameboard server, so rerun it with `WORKTREE_PORT_OFFSET=100` set
- The `cn` merge reads an unknown `text-*` name as a color and drops it beside `text-primary-foreground`, so the type steps take Tailwind's own `sm` to `2xl` names
- `bun run design:sync` needs the global `frameboard` binary and the gitignored board at the main worktree root, so CI never checks it
- A generated shadcn component imports `cn` from the `cn` package, so leave its import as the CLI wrote it while project code uses `@/lib/utils`
- Playwright's Linux WebKit drops the `Secure` session cookie over plain `http://localhost`, so `playwright.config.ts` declares Chromium alone
