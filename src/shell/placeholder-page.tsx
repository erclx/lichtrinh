import { useTranslation } from 'react-i18next'

import type { Destination } from '@/shell/destinations'
import { PageHeader } from '@/shell/page-header'

/** Holds a route's place until its screen row replaces the element. */
export function PlaceholderPage({
  titleKey,
}: {
  titleKey: Destination['labelKey']
}) {
  const { t } = useTranslation()

  return (
    <>
      <PageHeader title={t(titleKey)} />
      <p className="text-base text-muted-foreground">
        {t('shell.placeholder')}
      </p>
    </>
  )
}
