import { useTranslation } from 'react-i18next'

import { isLanguage } from './language'
import type { Language } from './resources'

/** The active language, which every `Intl` formatter in `format.ts` takes. */
export function useLanguage(): Language {
  const { i18n } = useTranslation()
  return isLanguage(i18n.language) ? i18n.language : 'en'
}
