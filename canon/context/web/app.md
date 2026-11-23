---
title: App
description: The React front end, its Tailwind styling and shadcn kit, and where its tests and screenshots live
---

# App

## Overview

Owns the browser app the traveler and the family open, from `index.html` and `src/` down to the shared UI kit. The Worker serving it and the API are the subject of `canon/context/web/api.md`. The bridge to Claude and the voice service are not built yet, and each takes its own entry when it lands.

## Layout

### `src/`

Holds the React entry and the route table. `main.tsx` loads `src/i18n/setup.ts` and then mounts the named `App` export from `app.tsx`, and `index.css` holds the color roles, the Nunito font, the five type steps, the 64px `--spacing-target`, and the radius roles that `canon/DESIGN.md` describes.

- `app.tsx` renders `SessionProvider`, then the query cache from `canon/context/web/calendar-data.md`, then `UndoProvider`, around a React Router data router built once from `router.tsx`
- `router.tsx` is the one route table, the session gate over the shell over every page, which screen rows extend and never rename
- Light values sit on `:root` and dark on `:root[data-theme='dark']`, and the `dark:` variant reads the same attribute, which the head script in `index.html` sets from Appearance or the device
- Tailwind v4 runs through `@tailwindcss/vite`, so there is no `tailwind.config` file

### `src/i18n/`

Holds the translation layer every screen reads its copy through, on i18next and react-i18next, with one `translation` namespace.

- `locales/en.ts` is the shape source, and `locales/vi.ts` satisfies the `Messages` type `resources.ts` derives from it, so a key in one alone fails `tsc`
- `language.ts` picks the opening language, a device choice first, then the account's, then Vietnamese in production and English in development, and never the browser's
- `setup.ts` starts the instance before the first render and keeps `<html lang>` in step, and its `chooseLanguage` stores a press while `applyLanguage` never does
- `i18next.d.ts` types every `t()` key against `en.ts`, and `resources.test.ts` checks both modules hold the same keys with none empty
- `format.ts` holds the `Intl` date, time, length, and money formatters, each taking the language from `useLanguage()`, and formats a `YYYY-MM-DD` day in UTC so the device zone never moves it

### `src/session/`

Holds app-wide sign-in state, the role `src/i18n/` holds for language, so a feature reads it without importing another feature.

- `provider.tsx` loads `GET /api/auth/me` once and keeps `loading`, `signed-out`, `signed-in`, or `unreachable`, the last kept apart so an offline person is not signed out
- `session-context.ts` exports `useSession()`, with sign in, sign out, retry, and the language save a toggle press sends
- The account's language applies through `applyLanguage` only where the device holds no stored choice
- `gate.tsx` renders the sign-in card, the retry page, or the shell at whatever path was asked for, and `require-admin.tsx` shows a member the not-found page

### `src/shell/`

Holds the frame around every signed-in page, built against `canon/design/shell/`.

- `app-shell.tsx` owns the `main` landmark, the gutters, and the breakpoints, phone under 480, tablet to 1023, and desktop from 1024, plus the chat places `canon/context/web/chat.md` describes
- `nav.tsx` draws the hideable desktop sidebar, the labeled tablet rail, and the phone tabs, which leave out admin entries
- A new place is one entry in `destinations.ts`, never markup in `nav.tsx`, and `placement: 'header'` puts it on the top bar's one button
- A page renders its own `page-header.tsx` and content, and `placeholder-page.tsx` backs no route since Calendar replaced it

### `src/features/`

Holds one folder per screen feature, each importing the session and the shell. Today renders the day's view, and no other feature imports another. The shared day list in `src/components/` reaches into `day/` for its swipe row and `entries/` for the delete sheet.

- `sign-in/` is the card a signed-out visitor sees, with no shell around it
- `accounts/` is the admin's list, the create and edit pages sharing `account-fields.tsx`, the reset confirm, and the password shown once, which lives in component state alone
- `settings/` holds Language, Appearance, Manage accounts, Exchange rates, and Assistant for the admin, and Sign out, and later rows add their own rows
- `settings/appearance.ts` keeps the device's Auto, Light, or Dark under `lichtrinh.theme`, the key and values the head script repeats since it cannot import the module
- `assistant-settings/` is the admin's page for the workspace PC's status, the model, and the offline contact name, and v01.6 appends its speech section

### `src/components/ui/`

Holds the shadcn kit on Base UI with the Nova preset, owned and edited in place.

- Add a component with `bunx --bun shadcn@latest add <component>`, which reads `components.json`
- A generated component imports `cn` from the `cn` package directly, while project code imports it from `@/lib/utils`

### `src/components/`

Holds the app's own components, being the mark, the language toggle, the hand-built pickers the screens consume unchanged, and what more than one calendar feature shows, such as the kind icons, the day list and its entry states, the save error, and the undo status.

- `picker-sheet.tsx` opens a drawer under 480px and a dialog from there up, under one title and close control
- `sheet-list.tsx` is the one select, with radio rows and an optional filter that ignores diacritics
- `date-range-sheet.tsx` renders a trip's From and To fields and the Trip dates sheet that sets both

### `src/features/`

Holds one folder per screen area, its rules and controls landing before its screens do.

- `trips/` holds the list, the new trip form, and the overview, and `today/` picks the trip under way in its own zone
- `day/` holds the day page, and its `swipe-row.tsx` reveals Delete under 1024px, never the only route to it
- `src/components/day-state.ts` marks each entry done, now, or upcoming on its own zone's clock, for Today and the Calendar tab alike
- `calendar/` is the Calendar tab, its view, date, and trip held in the address, and `calendar-range.ts` lays each trip over the month and week, splitting a date two trips share
- `entries/` holds the detail, the shared add and edit form, its prefill and cost parsing, and `lengths.ts` for the start times and lengths

### `canon/design/`

Holds the accepted board frames a screen builds against, one group folder per app part with a group file beside it naming the code it governs.

- `bun run design:sync` writes every frame from the mapping in `frames.json`, and `-- --check` reports drift, so no file there is edited by hand
- Each frame lands as one HTML file that switches theme itself, beside a light and a dark PNG, with its fonts under `assets/`

### Other folders

The folders below each carry one small job.

- `src/hooks/`: shared hooks, being `useMediaQuery`, which reads every query as unmatched in the test DOM, and `useNow`, renewed every 30 seconds
- `public/`: the favicon, the PNG icons from 16 to 512, and the light and dark social cards, while the web manifest is not written yet
- `src/lib/`: shared helpers, being `cn`, `month-cells.ts`, `trip-days.ts` for a trip's dates, and `api.ts`, whose `apiFetch` parses through a `shared/` schema and throws `ApiFailure`
- `src/test/`: the Vitest setup, `fake-api.ts` standing in for the API behind `fetch`, invented trip, entry, and chat builders, and `render-route.tsx`, which mounts the routes inside every provider
- `e2e/`: the Playwright specs and the screenshot harness, with its cases in `e2e/capture/cases.ts` and committed frames in `e2e/evidence/`

## Gotchas

- `bun run screenshot` refuses when port 4173 is taken, often by a Frameboard server, so rerun it with `WORKTREE_PORT_OFFSET=100` set
- The `cn` merge reads an unknown `text-*` name as a color and drops it beside `text-primary-foreground`, so the type steps take Tailwind's own `sm` to `2xl` names
- `bun run design:sync` needs the global `frameboard` binary and the gitignored board at the main worktree root, so it runs only on the owner's computer and CI never checks it
- The installed shadcn rule still says to import `cn` from `@/lib/utils` everywhere until the toolkit ships its fix, so leave a generated component's import as the CLI wrote it
- Playwright's Linux WebKit drops the `Secure` session cookie over plain `http://localhost`, so a signed-in e2e journey skips that engine and the iPhone check runs through a tunnel
