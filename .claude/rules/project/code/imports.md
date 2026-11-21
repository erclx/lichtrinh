---
description: Enforce the import direction between the browser app, the Worker, and the shared schemas
paths:
  - 'src/**/*.{ts,tsx}'
  - 'worker/**/*.ts'
  - 'shared/**/*.ts'
  - 'e2e/**/*.ts'
---

# Imports standards

## Direction

- Import shared code from `src/`, `worker/`, and `e2e/` through `@shared/*`, never through a relative path climbing out of the folder.
- Never import `worker/` from `src/` or `src/` from `worker/`, since they run in different runtimes and deploy as one Worker. Move what both need into `shared/`.
- Never import `src/` or `worker/` from `shared/`, since the assistant's tools import `shared/` too and would pull in a runtime they lack.

## Shared shapes

- Define a request or response shape both sides parse once in `shared/` as a zod schema, never as a second copy in `src/` or `worker/`.
