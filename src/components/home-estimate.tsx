import { convertMinor, findRate } from '@shared/rates.ts'
import { useTranslation } from 'react-i18next'

import { useRates } from '@/calendar-data/rates'
import { formatApproxMoney } from '@/i18n/format'
import { useLanguage } from '@/i18n/use-language'

interface HomeEstimateProps {
  /** The amount in the trip currency's minor unit. */
  amountMinor: number
  currency: string
  homeCurrency: string
  className?: string
}

/**
 * An amount in the trip currency read as an approximate home-currency figure,
 * such as "about 268 USD". It renders nothing when both currencies match or no
 * rate is stored, since "about 0" would read as a real figure.
 */
export function HomeEstimate({
  amountMinor,
  currency,
  homeCurrency,
  className,
}: HomeEstimateProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const rates = useRates()
  if (currency === homeCurrency || rates.data === undefined) return null
  const ratio = findRate(rates.data, currency, homeCurrency)
  if (ratio === null) return null
  const converted = convertMinor(amountMinor, currency, homeCurrency, ratio)
  return (
    <span className={className}>
      {t('budget.about', {
        amount: formatApproxMoney(converted, homeCurrency, language),
      })}
    </span>
  )
}
