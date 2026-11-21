---
description: Route every user-facing string through the translation files, with a Vietnamese and an English entry
paths:
  - 'src/**/*.tsx'
  - 'src/**/*.ts'
---

# Translation standards

## User-facing copy

- Never hard-code user-facing copy in a component. Render it through a translation key.
- Give every key a Vietnamese and an English entry in the same change, since production opens in Vietnamese.
