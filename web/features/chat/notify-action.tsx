import type { NoticeKind, SentNotice } from '@shared/notices.ts'
import { BellIcon, CheckIcon } from 'lucide-react'
import { type Ref, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useNotices } from '@/features/chat/use-notices'
import { useNow } from '@/hooks/use-now'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'

interface NotifyActionProps {
  kind: NoticeKind
  /** Whom to ask with no way to notify, or null for the admin. */
  contactName: string | null
  /** The reader is an admin, who turns the computer on rather than telling. */
  admin: boolean
}

const COPY = {
  assistant: {
    admin: 'chat.offlineSelf',
    contact: 'chat.offlineContact',
    noContact: 'chat.offlineAdmin',
    back: 'chat.noticeBack',
    hint: 'chat.notifyHint',
    variant: 'default',
    look: '',
  },
  voice: {
    admin: 'talk.offSelf',
    contact: 'talk.offContact',
    noContact: 'talk.offAdmin',
    back: 'talk.noticeBack',
    hint: null,
    variant: 'outline',
    look: 'border-2 border-muted-foreground bg-card dark:border-muted-foreground dark:bg-card',
  },
} as const

/** What an offline card ends on: telling the admin, or whom to ask instead. */
export function NotifyAction({ kind, contactName, admin }: NotifyActionProps) {
  const { t } = useTranslation()
  return admin ? (
    <p className="text-base font-bold">{t(COPY[kind].admin)}</p>
  ) : (
    <Notify kind={kind} contactName={contactName} />
  )
}

function Notify({ kind, contactName }: Omit<NotifyActionProps, 'admin'>) {
  const { t } = useTranslation()
  const copy = COPY[kind]
  const { reachable, notice, unread, send } = useNotices(kind)
  const sentRef = useRef<HTMLDivElement>(null)

  // The button the press was on is gone, so the line replacing it takes focus.
  useEffect(() => {
    if (send.isSuccess) sentRef.current?.focus({ preventScroll: true })
  }, [send.isSuccess])

  if (notice !== null) {
    return <SentLine ref={sentRef} notice={notice} back={t(copy.back)} />
  }
  // So the card never swaps one ending for another as the read lands.
  if (reachable === undefined && !unread) return null
  if (reachable !== true) {
    return (
      <p className="text-base font-bold break-words">
        {contactName === null
          ? t(copy.noContact)
          : t(copy.contact, { name: contactName })}
      </p>
    )
  }

  const failed =
    send.isError &&
    !(send.error instanceof ApiFailure && send.error.code === 'not_down')
  const label = send.isPending
    ? t('chat.notifying')
    : failed
      ? t('chat.retry')
      : t('chat.notify')

  return (
    <>
      {failed && (
        <p
          role="alert"
          className="mt-1.5 border-t-[1.5px] border-border pt-3.5 text-base font-bold"
        >
          {t('chat.noticeFailed')}
        </p>
      )}
      <Button
        variant={copy.variant}
        onClick={() => {
          if (!send.isPending) send.mutate()
        }}
        aria-disabled={send.isPending}
        aria-busy={send.isPending}
        className={cn(
          'mt-2 h-auto min-h-target w-full py-2 whitespace-normal aria-disabled:opacity-85',
          copy.look,
        )}
      >
        {send.isPending ? (
          <span
            aria-hidden="true"
            className="size-6 shrink-0 rounded-full border-3 border-current/35 border-t-current motion-safe:animate-spin"
          />
        ) : (
          <BellIcon aria-hidden="true" className="size-6.5" strokeWidth={2.2} />
        )}
        {label}
      </Button>
      {copy.hint !== null && !send.isPending && !failed && (
        <p className="text-sm text-muted-foreground">{t(copy.hint)}</p>
      )}
    </>
  )
}

/** Says a notice went out, never that anyone saw it. */
function SentLine({
  ref,
  notice,
  back,
}: {
  ref: Ref<HTMLDivElement>
  notice: SentNotice
  back: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()
  const at = new Date(notice.sentAt)
  const time = clockTime(at, language)
  const today = at.toDateString() === now.toDateString()
  const when = { time, date: shortDay(at, language), name: notice.byName }

  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      className="mt-1.5 flex items-start gap-3 border-t-[1.5px] border-border pt-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <CheckIcon className="size-5" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold break-words">
          {notice.byMe
            ? t(today ? 'chat.noticeSent' : 'chat.noticeSentOn', when)
            : t(today ? 'chat.noticeTold' : 'chat.noticeToldOn', when)}
        </p>
        <p className="text-sm text-muted-foreground">{back}</p>
      </div>
    </div>
  )
}

// On the device's own clock, as the offline card reads its saved time.
function clockTime(at: Date, language: Language) {
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at)
}

function shortDay(at: Date, language: Language) {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'numeric',
  }).format(at)
}
