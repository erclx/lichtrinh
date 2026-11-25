---
description: Enforce the import direction between the browser app, the Worker, the CLI, the owner panel, and the shared schemas
paths:
  - 'web/**/*.{ts,tsx}'
  - 'worker/**/*.ts'
  - 'shared/**/*.ts'
  - 'e2e/**/*.ts'
  - 'cli/**/*.ts'
  - 'panel/**/*.{ts,tsx}'
---

# Imports standards

## Direction

- Import shared code from `web/`, `worker/`, and `e2e/` through `@shared/*`, never through a relative path climbing out of the folder.
- Never import `worker/` from `web/` or `web/` from `worker/`, since they run in different runtimes and deploy as one Worker. Move what both need into `shared/`.
- Import `shared/` from `cli/` through `@shared/*`, and never import `web/` or `worker/` from it, since the command runs on the owner's machine outside both runtimes.
- Never import `web/` or `worker/` from `shared/`, since the assistant's tools import `shared/` too and would pull in a runtime they lack.

## Owner panel

- Import `shared/` from `panel/` through `@shared/*`, and import `@/components/`, `@/lib/utils`, and `web/index.css` from `panel/ui/` alone, since the status server runs under Bun with no page.
- Never import `web/features/`, `worker/`, `bridge/`, or `voice/` from `panel/`, since the panel watches those processes and runs beside none of their state.
- Read `panel/services.ts` from `cli/panel/`, so a unit name has one source, and import nothing else of `panel/` there.

## Shared shapes

- Define a request or response shape both sides parse once in `shared/` as a zod schema, never as a second copy in `web/` or `worker/`.
