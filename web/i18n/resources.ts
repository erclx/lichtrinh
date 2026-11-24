import * as en from './locales/en'
import * as vi from './locales/vi'

export const languages = ['vi', 'en'] as const

export type Language = (typeof languages)[number]

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

/** The key tree of `en` with every leaf widened to a string, which each language must satisfy. */
export type Messages = Widen<typeof en>

// Spread into plain objects, since a module namespace is sealed and has no prototype.
export const resources = {
  en: { translation: { ...en } },
  vi: { translation: { ...vi } satisfies Messages },
} as const
