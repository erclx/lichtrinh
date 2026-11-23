import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import {
  isLanguage,
  readStoredLanguage,
  resolveInitialLanguage,
  storeLanguage,
} from './language'
import { type Language, languages, resources } from './resources'

const initial = resolveInitialLanguage({
  stored: readStoredLanguage(),
  isProduction: import.meta.env.PROD,
})

// Synchronous init with inline resources, so the first render already reads
// the resolved language and a Vietnamese load never paints English first.
void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  supportedLngs: languages,
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
})

document.documentElement.lang = initial

i18n.on('languageChanged', (language) => {
  if (isLanguage(language)) document.documentElement.lang = language
})

/**
 * Applies a language without remembering it, the seam a signed-in account's
 * language goes through. Storing it there would make the device outrank the
 * account on every later visit.
 */
export function applyLanguage(language: Language) {
  return i18n.changeLanguage(language)
}

/** Applies a language a person picked and remembers it on the device. */
export async function chooseLanguage(language: Language) {
  storeLanguage(language)
  await applyLanguage(language)
}
