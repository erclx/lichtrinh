import { type Language, languages } from './resources'

const storageKey = 'lichtrinh.language'

export function isLanguage(value: unknown): value is Language {
  return languages.some((language) => language === value)
}

interface InitialLanguageInputs {
  /** The choice remembered on this device, as read back from storage. */
  stored: Language | null
  /** The signed-in account's language, absent until sign-in passes it. */
  account?: Language | null
  isProduction: boolean
}

/**
 * The device's choice wins, then the account's, then the build default.
 * The browser's own language is never read, so a phone set to English still
 * opens production in Vietnamese.
 */
export function resolveInitialLanguage({
  stored,
  account,
  isProduction,
}: InitialLanguageInputs): Language {
  return stored ?? account ?? (isProduction ? 'vi' : 'en')
}

// Reaching `localStorage` at all throws in some private modes, so the default
// is resolved inside each guard rather than as a parameter default.
export function readStoredLanguage(storage?: Storage): Language | null {
  try {
    const value = (storage ?? localStorage).getItem(storageKey)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

export function storeLanguage(language: Language, storage?: Storage): void {
  try {
    ;(storage ?? localStorage).setItem(storageKey, language)
  } catch {
    // An unremembered choice still applies for this visit.
  }
}
