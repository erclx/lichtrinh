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

- Keep one namespace, `translation`, and one message module per language at `web/i18n/locales/en.ts` and `web/i18n/locales/vi.ts`, since every screen row writes into them.
- Nest keys one block per screen or feature, such as `common` or `today`. Add your own block and rename none, since a rename breaks every row reading it.
- Treat `en.ts` as the shape source and have `vi.ts` satisfy the `Messages` type derived from it, so a key in one module alone fails `tsc`.
- Never widen `vi.ts` or a later language module through `as` or `any`, since a cast lets a missing key past `tsc`. The `as const` closing `en.ts` is the one assertion allowed, since it keeps the shape source literal.
- Read copy through `useTranslation()` from `react-i18next` and a typed key, never a literal string.
- Format numbers, money, and dates through `Intl` with the active language, never by hand.
- Switch the language through `web/i18n/setup.ts`, with `chooseLanguage` for a person's press, which remembers it on the device, and `applyLanguage` for an account's language, which never does.
- Never read the browser's language. A device choice wins, then the account's language, then the build default.
