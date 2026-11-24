---
description: Route every user-facing string through the translation files, with a Vietnamese and an English entry
paths:
  - 'web/**/*.tsx'
  - 'web/**/*.ts'
---

# Translation standards

## User-facing copy

- Never hard-code user-facing copy in a component. Render it through a translation key.
- Give every key a Vietnamese and an English entry in the same change, since production opens in Vietnamese.

## Message layout

- Keep one namespace, `translation`, and one file per block per language, such as `web/i18n/locales/vi/today.ts`, so branches adding copy rarely touch one file.
- Export each block from its language's `index.ts` in one line, such as `web/i18n/locales/vi/index.ts`.
- Nest keys one block per screen or feature, such as `errors` or `today`. Add your own block and rename none, since a rename breaks every row reading it.
- Treat the `en` blocks as the shape source and have each `vi` block satisfy its slice of the `Messages` type derived from them, so a key in one language alone fails `tsc`.
- Never widen a `vi` block or a later language's through `as` or `any`, since a cast lets a missing key past `tsc`. The one assertion allowed is the `as const` closing each `en` block.

## Reading copy

- Read copy through `useTranslation()` from `react-i18next` and a typed key, never a literal string.
- Format numbers, money, and dates through `Intl` with the active language, never by hand.
- Switch the language through `web/i18n/setup.ts`, with `chooseLanguage` for a person's press, which remembers it on the device, and `applyLanguage` for an account's language, which never does.
- Never read the browser's language. A device choice wins, then the account's language, then the build default.
