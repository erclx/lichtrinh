import type { Chat } from '@shared/chats.ts'
import type { TFunction } from 'i18next'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { LoadFailed } from '@/components/load-failed'
import { Button } from '@/components/ui/button'
import { useChats, useStartChat } from '@/features/chat/chat-api'
import { StartFailed } from '@/features/chat/start-failed'
import { useNow } from '@/hooks/use-now'
import type { Language } from '@/i18n/resources'
import { useLanguage } from '@/i18n/use-language'
import { useSession } from '@/session/session-context'
import { AssistantIcon, PlusIcon } from '@/shell/icons'
import { NotFoundPage } from '@/shell/not-found-page'
import { PageHeader } from '@/shell/page-header'

function dayKey(at: Date) {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
}

/** When a chat was last active, read on the device's own clock. */
function whenOf(iso: string, now: Date, t: TFunction, language: Language) {
  const at = new Date(iso)
  if (dayKey(at) === dayKey(now)) {
    return new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at)
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(at) === dayKey(yesterday)) return t('chat.yesterday')
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'numeric',
  }).format(at)
}

/**
 * The traveler's saved chats, most recent first, with New chat. An account
 * that cannot chat gets the not-found page and never asks the API.
 */
export function ChatListPage() {
  const { user } = useSession()
  return user?.canChat === true ? <ChatList /> : <NotFoundPage />
}

function ChatList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const chats = useChats()
  const start = useStartChat()
  const emptyId = useId()

  function startChat() {
    start.mutate(undefined, {
      onSuccess: (chat) =>
        void navigate(`/chats/${encodeURIComponent(chat.id)}`),
    })
  }

  const newChat = (
    <Button
      className="w-full"
      onClick={startChat}
      aria-disabled={start.isPending}
    >
      <PlusIcon aria-hidden="true" />
      {t('chat.newChat')}
    </Button>
  )

  return (
    <>
      <PageHeader
        title={t('chat.listTitle')}
        backTo="/"
        action={
          <button
            type="button"
            onClick={startChat}
            aria-label={t('chat.newChat')}
            className="inline-flex size-target items-center justify-center rounded-full bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <PlusIcon aria-hidden="true" className="size-6" />
          </button>
        }
      />
      <div className="flex flex-col gap-4">
        {start.isError && <StartFailed error={start.error} />}
        {chats.isPending ? (
          <p role="status" className="text-base text-muted-foreground">
            {t('shell.loading')}
          </p>
        ) : chats.isError && chats.data === undefined ? (
          <LoadFailed
            message={t('chat.listLoadFailed')}
            error={chats.error}
            onRetry={() => void chats.refetch()}
          />
        ) : chats.data.length === 0 ? (
          <section
            aria-labelledby={emptyId}
            className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-border bg-card p-5 text-card-foreground"
          >
            <h2 id={emptyId} className="text-lg font-extrabold">
              {t('chat.emptyTitle')}
            </h2>
            <p className="text-base text-muted-foreground">
              {t('chat.emptyBody')}
            </p>
            {newChat}
          </section>
        ) : (
          <>
            <ul className="flex flex-col">
              {chats.data.map((chat) => (
                <ChatRow key={chat.id} chat={chat} />
              ))}
            </ul>
            {newChat}
          </>
        )}
      </div>
    </>
  )
}

function ChatRow({ chat }: { chat: Chat }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useNow()

  return (
    <li className="border-b-[1.5px] border-border last:border-b-0">
      <Link
        to={`/chats/${encodeURIComponent(chat.id)}`}
        className="flex min-h-target items-center gap-4 rounded-md py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="flex size-13 shrink-0 items-center justify-center rounded-lg bg-muted">
          <AssistantIcon aria-hidden="true" className="size-7" />
        </span>
        <span className="min-w-0 flex-1 text-lg font-extrabold break-words">
          {chat.title ?? t('chat.untitled')}
        </span>
        <span className="shrink-0 self-start pt-1 text-sm text-muted-foreground">
          {whenOf(chat.updatedAt, now, t, language)}
        </span>
      </Link>
    </li>
  )
}
