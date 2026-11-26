import type { ChatMessage } from '@shared/chats.ts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { LoadFailed } from '@/components/load-failed'
import { ChangeCard } from '@/features/chat/change-card'
import { useContact, useStartChat, useThread } from '@/features/chat/chat-api'
import { Composer } from '@/features/chat/composer'
import {
  FailedCard,
  OfflineCard,
  TripGoneCard,
} from '@/features/chat/notice-card'
import { StepLine } from '@/features/chat/step-line'
import { stepText } from '@/features/chat/step-text'
import {
  isRunning,
  threadItems,
  type Turn,
  unsavedSend,
} from '@/features/chat/turn'
import { useAssistantStatus } from '@/features/chat/use-assistant-status'
import { usePinnedEnd } from '@/features/chat/use-pinned-end'
import { useTurn } from '@/features/chat/use-turn'
import {
  LiveFade,
  LiveGround,
  LiveWords,
} from '@/features/chat/voice/live-words'
import { useLanguage } from '@/i18n/use-language'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'
import { useSession } from '@/session/session-context'

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
  const admin = useSession().user?.role === 'admin'
  const { online, voiceOnline } = useAssistantStatus()
  // Without it, whether the workspace PC is off is unknown.
  const connected = useOnline()
  const start = useStartChat()
  const navigate = useNavigate()
  const [liveWords, setLiveWords] = useState('')
  const covered = liveWords !== ''
  const offline = online === false
  const running = turn !== null && isRunning(turn)

  // The dock and sheet follow the newest chat, so only the page navigates.
  function startChat() {
    start.mutate(undefined, {
      onSuccess: (chat) => {
        if (layout === 'page') {
          void navigate(`/chats/${encodeURIComponent(chat.id)}`)
        }
      },
    })
  }
  const items = threadItems(thread.data?.messages ?? [], turn)
  const panel = layout === 'panel'
  const { scroller, content, foot } = usePinnedEnd({
    scrollsItself: panel,
    covered,
  })

  const retry = (text: string | null) =>
    text === null || offline || !connected || running
      ? null
      : () => void send(text)

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

  return (
    // Clipped while covered, so words past the thread's top stay off its header.
    <div
      className={cn(
        'flex flex-1 flex-col',
        panel && 'min-h-0',
        covered && 'overflow-y-clip',
      )}
    >
      {covered && <LiveFade />}
      <div className={cn('relative flex flex-1 flex-col', panel && 'min-h-0')}>
        <div
          ref={scroller}
          inert={covered}
          className={cn(
            'flex flex-1 flex-col',
            panel ? 'min-h-0 overflow-y-auto px-4 py-3' : 'pb-3',
          )}
        >
          <div ref={content} className="flex flex-col gap-3">
            {offline && connected && (
              <OfflineCard contactName={contact.data ?? null} admin={admin} />
            )}
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
                        <LiveReply
                          turn={item.turn}
                          onRetry={retry(item.retry)}
                        />
                      </li>
                    )
                  }
                  const { message } = item
                  if (message.role === 'user') {
                    return <Asked key={message.id} text={message.text} />
                  }
                  return (
                    <li key={message.id} className={reply}>
                      <SavedReply
                        message={message}
                        onRetry={retry(item.retry)}
                      />
                    </li>
                  )
                })}
              </ol>
            )}
            {turn?.phase === 'refused' &&
              (turn.refusal === 'no_trip' ? (
                <TripGoneCard
                  onNewChat={startChat}
                  pending={start.isPending}
                  error={start.isError ? start.error : null}
                />
              ) : (
                <p role="alert" className="rounded-md bg-muted p-3 text-sm">
                  {turn.refusal === 'assistant_busy'
                    ? t('chat.busy')
                    : turn.refusal === 'network'
                      ? t('errors.network')
                      : t('errors.generic')}
                </p>
              ))}
          </div>
        </div>
        {covered && <LiveGround />}
      </div>
      <div
        ref={foot}
        className={cn(
          panel
            ? 'border-t-[1.5px] border-border p-4'
            : 'sticky bottom-0 bg-background pt-2 pb-[max(16px,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="relative">
          {covered && <LiveWords text={liveWords} layout={layout} />}
          <Composer
            running={running}
            offline={offline}
            connected={connected}
            voiceOnline={voiceOnline}
            empty={!thread.isPending && items.length === 0}
            contactName={contact.data ?? null}
            admin={admin}
            onSend={send}
            onStop={stop}
            onLive={setLiveWords}
          />
        </div>
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
