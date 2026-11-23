import { useTranslation } from 'react-i18next'

import { ApiFailure } from '@/lib/api'

/** Why a new chat did not start, said where the press was made. */
export function StartFailed({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const code = error instanceof ApiFailure ? error.code : null

  return (
    <p role="alert" className="rounded-md bg-muted p-3 text-sm">
      {code === 'no_trip'
        ? t('chat.noTrip')
        : code === 'network'
          ? t('errors.network')
          : t('chat.newChatFailed')}
    </p>
  )
}
