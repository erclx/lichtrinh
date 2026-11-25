import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { NotifyAction } from '@/features/chat/notify-action'

const card =
  'flex flex-col gap-2 rounded-xl border-[1.5px] border-border bg-muted p-5'

interface VoiceOffCardProps {
  contactName: string | null
  admin: boolean
}

/**
 * Says voice is off while the assistant still answers, ending as the chat's
 * offline card does.
 */
export function VoiceOffCard({ contactName, admin }: VoiceOffCardProps) {
  const { t } = useTranslation()
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className={card}>
      <h2 id={titleId} className="text-lg font-extrabold">
        {t('talk.offTitle')}
      </h2>
      <p className="text-base">{t('talk.offBody')}</p>
      <NotifyAction kind="voice" contactName={contactName} admin={admin} />
    </section>
  )
}

/** The microphone was refused, which no prompt asks about again by itself. */
export function MicDeniedCard() {
  const { t } = useTranslation()
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className={card}>
      <h2 id={titleId} className="text-lg font-extrabold">
        {t('talk.deniedTitle')}
      </h2>
      <p className="text-base">{t('talk.deniedBody')}</p>
    </section>
  )
}

/** One plain line above the row, for a retry, a failure, or the review hint. */
export function TalkLine({ children }: { children: string }) {
  return <p className="text-base text-muted-foreground">{children}</p>
}
