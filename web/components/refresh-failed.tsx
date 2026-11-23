import { useTranslation } from 'react-i18next'

import { useOnline } from '@/offline/connection'

/**
 * Says a loaded page could not refresh, shown above what stays on screen,
 * since a failed background read keeps the last data rather than replacing it.
 */
export function RefreshFailed({ show }: { show: boolean }) {
  const { t } = useTranslation()
  const online = useOnline()
  // Offline, the offline card already says the plan is the saved one.
  if (!show || !online) return null
  return (
    <p role="status" className="mb-3 rounded-lg bg-muted px-4 py-2 text-sm">
      {t('errors.refreshFailed')}
    </p>
  )
}
