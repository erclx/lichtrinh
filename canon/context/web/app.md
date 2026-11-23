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

- `app.tsx` renders `SessionProvider` around a React Router data router built once from `router.tsx`
- `router.tsx` is the one route table, the session gate over the shell over `/`, `/trips`, `/calendar`, `/settings`, and `/admin/accounts`, which screen rows extend and never rename
- Light values sit on `:root` and dark on `:root[data-theme='dark']`, and the `dark:` variant reads the same attribute, which the head script in `index.html` sets from Appearance or the device
- Tailwind v4 runs through `@tailwindcss/vite`, so there is no `tailwind.config` file

### `src/i18n/`

Holds the translation layer every screen reads its copy through, on i18next and react-i18next, with one `translation` namespace.

- `locales/en.ts` is the shape source, and `locales/vi.ts` satisfies the `Messages` type `resources.ts` derives from it, so a key in one alone fails `tsc`
- `language.ts` picks the opening language, a device choice first, then the account's, then Vietnamese in production and English in development, and never the browser's
- `setup.ts` starts the instance before the first render and keeps `<html lang>` in step, and its `chooseLanguage` stores a press while `applyLanguage` never does
- `i18next.d.ts` types every `t()` key against `en.ts`, and `resources.test.ts` checks both modules hold the same keys with none empty
- `format.ts` holds the `Intl` date formatters, each taking the language, and formats a `YYYY-MM-DD` day in UTC so the device zone never moves it

### `src/session/`

Holds app-wide sign-in state, the role `src/i18n/` holds for language, so a feature reads it without importing another feature.

- `provider.tsx` loads `GET /api/auth/me` once and keeps `loading`, `signed-out`, `signed-in`, or `unreachable`, the last kept apart so an offline person is not signed out
- `session-context.ts` exports `useSession()`, with sign in, sign out, retry, and the language save a toggle press sends
- The account's language applies through `applyLanguage` only where the device holds no stored choice
- `gate.tsx` renders the sign-in card, the retry page, or the shell at whatever path was asked for, and `require-admin.tsx` shows a member the not-found page

### `src/shell/`

Holds the frame around every signed-in page, built against `canon/design/shell/`.

- `app-shell.tsx` owns the `main` landmark, the gutters, and the breakpoints, phone under 480, tablet to 1023, and desktop from 1024
- `nav.tsx` draws the hideable desktop sidebar, the labeled tablet rail, and the phone tabs, which leave out admin entries
- A new place is one entry in `destinations.ts`, never markup in `nav.tsx`, and `placement: 'header'` puts it on the top bar's one button
- A page renders its own `page-header.tsx` and content, while `placeholder-page.tsx` holds Today, Trips, and Calendar until their rows replace each element

### `src/features/`

Holds one folder per screen feature, each importing the session and the shell but never another feature.

- `sign-in/` is the card a signed-out visitor sees, with no shell around it
- `accounts/` is the admin's list, create, reset confirm, and the password shown once, which lives in component state alone
- `settings/` holds Language, Appearance, Manage accounts for the admin, and Sign out, and later rows add their own rows
- `settings/appearance.ts` keeps the device's Auto, Light, or Dark under `lichtrinh.theme`, the key and values the head script repeats since it cannot import the module

### `src/components/ui/`

Holds the shadcn kit on Base UI with the Nova preset, owned and edited in place.

- Add a component with `bunx --bun shadcn@latest add <component>`, which reads `components.json`
- A generated component imports `cn` from the `cn` package directly, while project code imports it from `@/lib/utils`

### `src/components/`

Holds the app's own components, being the mark, the language toggle, and the hand-built pickers the screens consume unchanged.

- `picker-sheet.tsx` opens a drawer under 480px and a dialog from there up, under one title and close control
- `sheet-list.tsx` is the one select, with radio rows and an optional filter that ignores diacritics
- `date-range-sheet.tsx` renders a trip's From and To fields and the Trip dates sheet that sets both

### `src/features/`

Holds one folder per screen area, its rules and controls landing before its screens do.

- `entries/lengths.ts` holds the half-hour start times, the six lengths, and the end a length makes
- `day/swipe-row.tsx` reveals a row's Delete on a left drag under 1024px, never the only route to it

### `canon/design/`

Holds the accepted board frames a screen builds against, one group folder per app part with a group file beside it naming the code it governs.

- `bun run design:sync` writes every frame from the mapping in `frames.json`, and `-- --check` reports drift, so no file there is edited by hand
- Each frame lands as one HTML file that switches theme itself, beside a light and a dark PNG, with its fonts under `assets/`

### Other folders

The folders below each carry one small job.

- `src/hooks/`: shared hooks, being `useMediaQuery`, which reads every query as unmatched in the test DOM
- `public/`: the favicon, the PNG icons from 16 to 512, and the light and dark social cards, while the web manifest is not written yet
- `src/lib/`: shared helpers, being `cn`, `month-cells.ts` for the Monday-first month, and `api.ts`, whose `apiFetch` parses through a `shared/` schema and throws `ApiFailure`
- `src/test/`: the Vitest setup file and `fake-api.ts`, which stands in for the API behind `fetch` in component tests
- `e2e/`: the Playwright specs and the screenshot harness, with its cases in `e2e/capture/cases.ts` and committed frames in `e2e/evidence/`

## Gotchas

- `bun run screenshot` refuses when port 4173 is taken, often by a Frameboard server, so rerun it with `WORKTREE_PORT_OFFSET=100` set
- The `cn` merge reads an unknown `text-*` name as a color and drops it beside `text-primary-foreground`, so the type steps take Tailwind's own `sm` to `2xl` names
- `bun run design:sync` needs the global `frameboard` binary and the gitignored board at the main worktree root, so it runs only on the owner's computer and CI never checks it
- The installed shadcn rule still says to import `cn` from `@/lib/utils` everywhere until the toolkit ships its fix, so leave a generated component's import as the CLI wrote it
- Playwright's Linux WebKit drops the `Secure` session cookie over plain `http://localhost`, so a signed-in e2e journey skips that engine and the iPhone check runs through a tunnel
