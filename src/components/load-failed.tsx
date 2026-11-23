import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiFailure } from '@/lib/api'

interface LoadFailedProps {
  /** What failed to load, such as `Couldn't load the trips.` */
  message: string
  error: unknown
  onRetry: () => void
}

/** A read that failed, with what to do about it and a retry. */
export function LoadFailed({ message, error, onRetry }: LoadFailedProps) {
  const { t } = useTranslation()
  const network = error instanceof ApiFailure && error.code === 'network'

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-xl bg-muted p-4"
    >
      <p className="text-base">
        {message} {network ? t('errors.network') : t('errors.generic')}
      </p>
      <Button onClick={onRetry}>{t('shell.retry')}</Button>
    </div>
  )
}
