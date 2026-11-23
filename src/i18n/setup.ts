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

// Registered after init, so only a later change is remembered and an
// untouched device keeps following the account and the build default.
i18n.on('languageChanged', (language) => {
  if (!isLanguage(language)) return
  document.documentElement.lang = language
  storeLanguage(language)
})

/** The one seam the toggle, and later the signed-in account, switch through. */
export function changeLanguage(language: Language) {
  return i18n.changeLanguage(language)
}
