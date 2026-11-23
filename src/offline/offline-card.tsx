import { WifiOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useNow } from '@/hooks/use-now'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { useSavedAt } from '@/offline/connection'

/**
 * The id of the card's sentence, which each control waiting for the
 * connection names as its description, so a screen reader hears why.
 */
export const offlineReasonId = 'offline-reason'

// The saved time reads on the device's clock, the one the traveler's phone
// already shows, rather than in a trip's zone the card cannot pick.
function clockTime(at: number, language: Language) {
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
}

function dayKey(at: number) {
  return new Date(at).toDateString()
}

function shortDay(at: number, language: Language) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'numeric',
  }).format(at)
}

/**
 * The card from `canon/design/states/offline`, above every page while the
 * app cannot reach the API, naming when the plan on screen was saved.
 */
export function OfflineCard() {
  const { t } = useTranslation()
  const language = useLanguage()
  const savedAt = useSavedAt()
  const now = useNow()

  function reason() {
    if (savedAt === null) return t('offline.nothingSaved')
    const time = clockTime(savedAt, language)
    return dayKey(savedAt) === dayKey(now.getTime())
      ? t('offline.savedAt', { time })
      : t('offline.savedOn', { date: shortDay(savedAt, language), time })
  }

  return (
    <div
      role="status"
      className="mt-2 mb-4 flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted px-4 py-3.5 text-foreground"
    >
      <WifiOffIcon aria-hidden="true" className="size-7 shrink-0" />
      <p className="text-sm">
        <b className="block text-base font-extrabold">{t('offline.title')}</b>
        <span id={offlineReasonId}>{reason()}</span>
      </p>
    </div>
  )
}
