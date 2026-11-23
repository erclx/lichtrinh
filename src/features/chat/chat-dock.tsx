import { XIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { LoadFailed } from '@/components/load-failed'
import { Button } from '@/components/ui/button'
import { useChats, useStartChat } from '@/features/chat/chat-api'
import { StartFailed } from '@/features/chat/start-failed'
import { Thread } from '@/features/chat/thread'
import { cn } from '@/lib/utils'
import { PlusIcon } from '@/shell/icons'

interface ChatDockProps {
  /**
   * `dock` is the column beside the page from 1024 wide, and `sheet` the
   * half sheet over the page from 480 to 1023.
   */
  variant: 'dock' | 'sheet'
  onClose: () => void
}

const focusRing =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/** The latest chat beside or over the page, with its close control. */
export function ChatDock({ variant, onClose }: ChatDockProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const chats = useChats()
  const start = useStartChat()
  const latest = chats.data?.[0]
  const sheet = variant === 'sheet'

  // A pressed sheet takes focus, and the dock, there from load, takes none.
  useEffect(() => {
    if (sheet) closeRef.current?.focus()
  }, [sheet])

  function onKeyDown(event: KeyboardEvent) {
    if (sheet && event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const title = sheet
    ? t('chat.panelTitle')
    : (latest?.title ?? t('chat.panelTitle'))

  const body = chats.isPending ? (
    <p role="status" className="px-4 text-base text-muted-foreground">
      {t('shell.loading')}
    </p>
  ) : chats.isError && chats.data === undefined ? (
    <div className="px-4">
      <LoadFailed
        message={t('chat.listLoadFailed')}
        error={chats.error}
        onRetry={() => void chats.refetch()}
      />
    </div>
  ) : latest === undefined ? (
    <div className="flex flex-col gap-3 px-4">
      <p className="text-base text-muted-foreground">{t('chat.emptyBody')}</p>
      {start.isError && <StartFailed error={start.error} />}
      <Button
        className="w-full"
        onClick={() => start.mutate()}
        aria-disabled={start.isPending}
      >
        <PlusIcon aria-hidden="true" />
        {t('chat.newChat')}
      </Button>
    </div>
  ) : (
    <Thread key={latest.id} chatId={latest.id} layout="panel" />
  )

  const content = (
    <>
      {sheet && (
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border"
        />
      )}
      <div className="flex items-center gap-2 py-2 pr-2 pl-4">
        <h2
          id={titleId}
          className="min-w-0 flex-1 truncate text-lg font-extrabold"
        >
          {title}
        </h2>
        <Link
          to="/chats"
          className={cn(
            'inline-flex min-h-target shrink-0 items-center rounded-full px-3 text-sm font-extrabold text-muted-foreground hover:text-foreground',
            focusRing,
          )}
        >
          {t('chat.allChats')}
        </Link>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('chat.close')}
          className={cn(
            'inline-flex size-target shrink-0 items-center justify-center rounded-full bg-muted',
            focusRing,
          )}
        >
          <XIcon aria-hidden="true" className="size-6" strokeWidth={2.6} />
        </button>
      </div>
      {body}
    </>
  )

  if (sheet) {
    return (
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="fixed inset-x-0 bottom-0 left-28 z-30 flex h-[min(72svh,760px)] flex-col rounded-t-2xl border-t-[1.5px] border-border bg-background text-foreground shadow-[0_-12px_32px_rgb(0_0_0/0.14)]"
      >
        {content}
      </section>
    )
  }

  return (
    <aside
      aria-labelledby={titleId}
      className="sticky top-0 flex h-svh w-[360px] shrink-0 flex-col border-l-[1.5px] border-border bg-background xl:w-[420px]"
    >
      {content}
    </aside>
  )
}
