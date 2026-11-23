import type { ChatMessage } from '@shared/chats.ts'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadFailed } from '@/components/load-failed'
import { ChangeCard } from '@/features/chat/change-card'
import { useContact, useThread } from '@/features/chat/chat-api'
import { Composer } from '@/features/chat/composer'
import { FailedCard, OfflineCard } from '@/features/chat/notice-card'
import { StepLine } from '@/features/chat/step-line'
import { stepText } from '@/features/chat/step-text'
import {
  isRunning,
  threadItems,
  type Turn,
  unsavedSend,
} from '@/features/chat/turn'
import { useAssistantStatus } from '@/features/chat/use-assistant-status'
import { useTurn } from '@/features/chat/use-turn'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'

interface ThreadProps {
  chatId: string
  /**
   * `page` scrolls with the window under a composer kept at the foot, and
   * `panel` scrolls inside the dock or sheet holding it.
   */
  layout: 'page' | 'panel'
}

const reply =
  'flex max-w-[88%] flex-col gap-3 rounded-lg rounded-bl-sm border-[1.5px] border-border bg-card px-4 py-3 text-base text-card-foreground'

/** One conversation with its composer, shared by the page, the dock, and the sheet. */
export function Thread({ chatId, layout }: ThreadProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { turn, send, stop } = useTurn(chatId)
  const thread = useThread(chatId, unsavedSend(turn))
  const contact = useContact()
  const { online } = useAssistantStatus()
  const offline = online === false
  const running = turn !== null && isRunning(turn)
  const items = threadItems(thread.data?.messages ?? [], turn)
  const end = usePinnedEnd([
    items.length,
    turn?.phase,
    turn?.steps.length,
    turn?.reply.length,
  ])

  const retry = (text: string | null) =>
    text === null || offline || running ? null : () => void send(text)

  const lastStep = turn?.steps.at(-1)
  const announcement =
    turn === null
      ? ''
      : turn.phase === 'failed'
        ? t('chat.failedTitle')
        : turn.message !== null
          ? turn.message.text
          : lastStep !== undefined
            ? stepText(lastStep, t, language)
            : ''

  const panel = layout === 'panel'

  return (
    <div className={cn('flex flex-col', panel ? 'min-h-0 flex-1' : 'flex-1')}>
      <div
        className={cn(
          'flex flex-col gap-3',
          panel ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3' : 'flex-1 pb-3',
        )}
      >
        {offline && <OfflineCard contactName={contact.data ?? null} />}
        {thread.isPending ? (
          <p role="status" className="text-base text-muted-foreground">
            {t('shell.loading')}
          </p>
        ) : thread.isError && thread.data === undefined ? (
          <LoadFailed
            message={t('chat.threadLoadFailed')}
            error={thread.error}
            onRetry={() => void thread.refetch()}
          />
        ) : items.length === 0 ? (
          <p className="text-base text-muted-foreground">
            {t('chat.threadEmpty')}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item) => {
              if (item.kind === 'sent') {
                return <Asked key={item.id} text={item.text} />
              }
              if (item.kind === 'live') {
                return (
                  <li key={`live-${item.turn.sent.id}`} className={reply}>
                    <LiveReply turn={item.turn} onRetry={retry(item.retry)} />
                  </li>
                )
              }
              const { message } = item
              if (message.role === 'user') {
                return <Asked key={message.id} text={message.text} />
              }
              return (
                <li key={message.id} className={reply}>
                  <SavedReply message={message} onRetry={retry(item.retry)} />
                </li>
              )
            })}
          </ol>
        )}
        {turn?.phase === 'refused' && (
          <p role="alert" className="rounded-md bg-muted p-3 text-sm">
            {turn.refusal === 'assistant_busy'
              ? t('chat.busy')
              : turn.refusal === 'network'
                ? t('errors.network')
                : t('errors.generic')}
          </p>
        )}
        <div ref={end} className={panel ? undefined : 'scroll-mb-28'} />
      </div>
      <div
        className={cn(
          panel
            ? 'border-t-[1.5px] border-border p-4'
            : 'sticky bottom-0 bg-background pt-2 pb-[max(16px,env(safe-area-inset-bottom))]',
        )}
      >
        <Composer
          running={running}
          offline={offline}
          onSend={send}
          onStop={stop}
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

function Asked({ text }: { text: string }) {
  const { t } = useTranslation()

  return (
    <li className="ml-auto max-w-[88%] rounded-lg rounded-br-sm bg-primary px-4 py-3 text-base break-words whitespace-pre-wrap text-primary-foreground">
      <span className="sr-only">{t('chat.you')}: </span>
      {text}
    </li>
  )
}

function SavedReply({
  message,
  onRetry,
}: {
  message: ChatMessage
  onRetry: (() => void) | null
}) {
  const { t } = useTranslation()

  return (
    <>
      <span className="sr-only">{t('chat.assistantSaid')}: </span>
      {message.text !== '' && (
        <p className="break-words whitespace-pre-wrap">{message.text}</p>
      )}
      {message.changes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {message.changes.map((change) => (
            <li key={change.id}>
              <ChangeCard change={change} />
            </li>
          ))}
        </ul>
      )}
      {message.status === 'failed' && (
        <FailedCard changed={message.changes.length > 0} onRetry={onRetry} />
      )}
      {message.status === 'stopped' && (
        <p className="text-sm text-muted-foreground">{t('chat.stopped')}</p>
      )}
    </>
  )
}

/** The reply while it streams, and after a Stop or a drop until it saves. */
function LiveReply({
  turn,
  onRetry,
}: {
  turn: Turn
  onRetry: (() => void) | null
}) {
  const { t } = useTranslation()
  const waiting = isRunning(turn) && turn.reply === ''

  return (
    <>
      {turn.steps.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {turn.steps.map((step, index) => (
            // Steps only append, and two can match in every field.
            <StepLine key={index} step={step} />
          ))}
        </ul>
      )}
      {waiting && (
        <p className="flex items-center gap-3">
          <span aria-hidden="true" className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-foreground/70 motion-safe:animate-pulse" />
            <i className="size-2.5 rounded-full bg-foreground/50 motion-safe:animate-pulse motion-safe:[animation-delay:150ms]" />
            <i className="size-2.5 rounded-full bg-foreground/30 motion-safe:animate-pulse motion-safe:[animation-delay:300ms]" />
          </span>
          {t('chat.thinking')}
        </p>
      )}
      {turn.reply !== '' && (
        <p className="break-words whitespace-pre-wrap">{turn.reply}</p>
      )}
      {turn.phase === 'stopped' && (
        <p className="text-sm text-muted-foreground">{t('chat.stopped')}</p>
      )}
      {turn.phase === 'failed' && (
        <FailedCard changed={turn.changed} onRetry={onRetry} />
      )}
    </>
  )
}

/**
 * Keeps the newest row in view as rows arrive, unless the person scrolled
 * up to read, which the end marker leaving view tells apart.
 */
function usePinnedEnd(content: unknown[]) {
  const end = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const key = JSON.stringify(content)

  useEffect(() => {
    const marker = end.current
    if (marker === null || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      pinned.current = entry?.isIntersecting ?? true
    })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (pinned.current) end.current?.scrollIntoView?.({ block: 'end' })
  }, [key])

  return end
}
