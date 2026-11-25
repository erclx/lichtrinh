import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { NotifyAction } from '@/features/chat/notify-action'
import { StartFailed } from '@/features/chat/start-failed'
import { PlusIcon } from '@/shell/icons'

interface OfflineCardProps {
  contactName: string | null
  admin: boolean
}

/**
 * Says the workspace PC is off and ends on telling the admin, or whom to ask
 * from the contact setting. The plan stays editable by hand, which the card
 * says too.
 */
export function OfflineCard({ contactName, admin }: OfflineCardProps) {
  const { t } = useTranslation()
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-xl border-[1.5px] border-border bg-muted p-5"
    >
      <h2 id={titleId} className="text-lg font-extrabold">
        {t('chat.offlineTitle')}
      </h2>
      <p className="text-base">{t('chat.offlineBody')}</p>
      <NotifyAction kind="assistant" contactName={contactName} admin={admin} />
    </section>
  )
}

interface TripGoneCardProps {
  onNewChat: () => void
  pending: boolean
  error: unknown
}

/**
 * A send refused because the chat's trip was deleted, which no retry can
 * fix, so it offers a new chat on the trip under way instead.
 */
export function TripGoneCard({ onNewChat, pending, error }: TripGoneCardProps) {
  const { t } = useTranslation()

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-md bg-muted p-3">
      <p className="text-sm">{t('chat.tripGone')}</p>
      {error !== null && <StartFailed error={error} />}
      <Button className="w-full" onClick={onNewChat} aria-disabled={pending}>
        <PlusIcon aria-hidden="true" />
        {t('chat.newChat')}
      </Button>
    </div>
  )
}

interface FailedCardProps {
  changed: boolean
  /** Shown only on the reply that ends the thread, which Try again answers. */
  onRetry: (() => void) | null
}

/**
 * A reply that broke off, saying whether the plan changed before it did.
 * It takes the muted fill, since a pastel marks an entry's kind and never
 * a state.
 */
export function FailedCard({ changed, onRetry }: FailedCardProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 rounded-md bg-muted p-3">
        <p className="text-sm font-extrabold">{t('chat.failedTitle')}</p>
        <p className="text-sm">
          {changed ? t('chat.failedSome') : t('chat.failedNothing')}
        </p>
      </div>
      {onRetry !== null && (
        <Button className="w-full" onClick={onRetry}>
          {t('chat.retry')}
        </Button>
      )}
    </div>
  )
}
