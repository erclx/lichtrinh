---
title: App
description: The React front end, its Tailwind styling and shadcn kit, and where its tests and screenshots live
---

# App

## Overview

Owns the browser app the traveler and the family open, from `index.html` and `src/` down to the shared UI kit. The Cloudflare Worker API, the bridge to Claude, and the voice service are not built yet, and each takes its own entry when it lands.

## Layout

### `src/`

Holds the React entry and the app shell. `main.tsx` mounts the named `App` export from `app.tsx`, and `index.css` holds the Tailwind import and the shadcn theme tokens.

- `app.tsx` renders a placeholder heading until the design pass lands
- Tailwind v4 runs through `@tailwindcss/vite`, so there is no `tailwind.config` file

### `src/components/ui/`

Holds the shadcn kit on Base UI with the Nova preset, owned and edited in place.

- Add a component with `bunx --bun shadcn@latest add <component>`, which reads `components.json`
- A generated component imports `cn` from the `cn` package directly, while project code imports it from `@/lib/utils`

### Other folders

The folders below each carry one small job.

- `src/components/`: the app's own components, with the shadcn kit under `ui/`
- `src/lib/`: shared helpers, being `cn` re-exported from the `cn` package
- `src/test/`: the Vitest setup file the test config loads
- `e2e/`: the Playwright specs and the screenshot harness, with its cases in `e2e/capture/cases.ts` and committed frames in `e2e/evidence/`

## Gotchas

- `bun run screenshot` refuses when port 4173 is taken, often by a Frameboard server, so rerun it with `WORKTREE_PORT_OFFSET=100` set
- The installed shadcn rule still says to import `cn` from `@/lib/utils` everywhere until the toolkit ships its fix, so leave a generated component's import as the CLI wrote it
