---
title: App
description: The React front end, its Tailwind styling and shadcn kit, and where its tests and screenshots live
---

# App

## Overview

Owns the browser app the traveler and the family open, from `index.html` and `src/` down to the shared UI kit. The Worker serving it and the API are the subject of `canon/context/web/api.md`. The bridge to Claude and the voice service are not built yet, and each takes its own entry when it lands.

## Layout

### `src/`

Holds the React entry and the app shell. `main.tsx` loads `src/i18n/setup.ts` and then mounts the named `App` export from `app.tsx`, and `index.css` holds the color roles, the Nunito font, the five type steps, the 64px `--spacing-target`, and the radius roles that `canon/DESIGN.md` describes.

- `app.tsx` renders a header row with the mark, the wordmark, and the language toggle above a placeholder heading, until the screens land
- Light values sit on `:root` and dark on `:root[data-theme='dark']`, and the `dark:` variant reads the same attribute, which the head script in `index.html` sets from the device scheme
- Tailwind v4 runs through `@tailwindcss/vite`, so there is no `tailwind.config` file

### `src/i18n/`

Holds the translation layer every screen reads its copy through, on i18next and react-i18next, with one `translation` namespace.

- `locales/en.ts` is the shape source, and `locales/vi.ts` satisfies the `Messages` type `resources.ts` derives from it, so a key in one alone fails `tsc`
- `language.ts` picks the opening language, a device choice first, then the account's, then Vietnamese in production and English in development, and never the browser's
- `setup.ts` starts the instance synchronously before the first render and keeps `<html lang>` in step
- `chooseLanguage` stores a press under `lichtrinh.language`, while `applyLanguage` switches without storing, for an account's language
- `i18next.d.ts` types every `t()` key against `en.ts`, and `resources.test.ts` checks both modules hold the same keys with none empty

### `src/components/ui/`

Holds the shadcn kit on Base UI with the Nova preset, owned and edited in place.

- Add a component with `bunx --bun shadcn@latest add <component>`, which reads `components.json`
- A generated component imports `cn` from the `cn` package directly, while project code imports it from `@/lib/utils`

### `canon/design/`

Holds the accepted board frames a screen builds against, one group folder per app part with a group file beside it naming the code it governs.

- `bun run design:sync` writes every frame from the mapping in `frames.json`, and `-- --check` reports drift, so no file there is edited by hand
- Each frame lands as one HTML file that switches theme itself, beside a light and a dark PNG, with its fonts under `assets/`

### Other folders

The folders below each carry one small job.

- `src/components/`: the app's own components, being the inline `brand-mark.tsx` and the VI and EN `language-toggle.tsx`, with the shadcn kit under `ui/`
- `public/`: the favicon, the PNG icons from 16 to 512, and the light and dark social cards, while the web manifest is not written yet
- `src/lib/`: shared helpers, being `cn` re-exported from the `cn` package
- `src/test/`: the Vitest setup file the test config loads
- `e2e/`: the Playwright specs and the screenshot harness, with its cases in `e2e/capture/cases.ts` and committed frames in `e2e/evidence/`

## Gotchas

- `bun run screenshot` refuses when port 4173 is taken, often by a Frameboard server, so rerun it with `WORKTREE_PORT_OFFSET=100` set
- The `cn` merge reads an unknown `text-*` name as a color and drops it beside `text-primary-foreground`, so the type steps take Tailwind's own `sm` to `2xl` names
- `bun run design:sync` needs the global `frameboard` binary and the gitignored board at the main worktree root, so it runs only on the owner's computer and CI never checks it
- The installed shadcn rule still says to import `cn` from `@/lib/utils` everywhere until the toolkit ships its fix, so leave a generated component's import as the CLI wrote it
