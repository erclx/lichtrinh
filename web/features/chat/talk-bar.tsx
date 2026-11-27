import { type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useOpenLatestChat } from '@/features/chat/chat-api'
import { StartFailed } from '@/features/chat/start-failed'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'
import { offlineReasonId, waitingClass } from '@/offline/offline-card'
import { AssistantIcon } from '@/shell/icons'

interface TalkBarProps {
  /** Opens the sheet or the dock, which a phone has no room for. */
  onOpenPanel: () => void
  talkRef: Ref<HTMLButtonElement>
}

/**
 * The bar that opens the assistant: the latest chat's page on a phone, above
 * the tabs, and the sheet from 480 wide, at the page's foot. With no connection
 * it stays, saying it waits.
 */
export function TalkBar({ onOpenPanel, talkRef }: TalkBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roomy = useMediaQuery('(min-width: 480px)')
  const { open } = useOpenLatestChat()
  const [error, setError] = useState<unknown>(null)
  const [opening, setOpening] = useState(false)
  const online = useOnline()

  async function press() {
    if (!online) return
    if (roomy) {
      onOpenPanel()
      return
    }
    if (opening) return
    setError(null)
    setOpening(true)
    try {
      const chatId = await open()
      await navigate(`/chats/${encodeURIComponent(chatId)}`)
    } catch (caught) {
      setError(caught)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="sticky bottom-[max(--spacing(24.5),calc(--spacing(21)+env(safe-area-inset-bottom)))] z-10 bg-background px-gutter pt-2 pb-3 min-[480px]:bottom-0 min-[480px]:px-gutter-tablet min-[480px]:pb-[max(--spacing(4),env(safe-area-inset-bottom))] lg:px-gutter-desktop">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
        {error !== null && <StartFailed error={error} />}
        <button
          ref={talkRef}
          type="button"
          onClick={() => void press()}
          aria-disabled={opening || !online}
          aria-describedby={online ? undefined : offlineReasonId}
          className={cn(
            'flex min-h-target w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 text-lg font-extrabold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            !online && waitingClass,
          )}
        >
          <AssistantIcon aria-hidden="true" className="size-7 shrink-0" />
          {t(online ? 'chat.talk' : 'offline.needsConnection')}
        </button>
      </div>
    </div>
  )
}
