import { type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useOpenLatestChat } from '@/features/chat/chat-api'
import { StartFailed } from '@/features/chat/start-failed'
import { useMediaQuery } from '@/hooks/use-media-query'
import { AssistantIcon } from '@/shell/icons'

interface TalkBarProps {
  /** Opens the sheet or the dock, which a phone has no room for. */
  onOpenPanel: () => void
  talkRef: Ref<HTMLButtonElement>
}

/**
 * The bar that opens the assistant: above the tabs on a phone, where it
 * opens the latest chat's page, and at the foot of the page from 480 wide,
 * where it opens the sheet. The mic lives in the composer it opens.
 */
export function TalkBar({ onOpenPanel, talkRef }: TalkBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roomy = useMediaQuery('(min-width: 480px)')
  const { open } = useOpenLatestChat()
  const [error, setError] = useState<unknown>(null)
  const [opening, setOpening] = useState(false)

  async function press() {
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
    <div className="sticky bottom-[max(98px,calc(84px+env(safe-area-inset-bottom)))] z-10 bg-background px-4 pt-2 pb-3 min-[480px]:bottom-0 min-[480px]:px-8 min-[480px]:pb-[max(16px,env(safe-area-inset-bottom))] lg:px-10">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
        {error !== null && <StartFailed error={error} />}
        <button
          ref={talkRef}
          type="button"
          onClick={() => void press()}
          aria-disabled={opening}
          className="flex min-h-target w-full items-center justify-center gap-3 rounded-full bg-primary px-6 text-lg font-extrabold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <AssistantIcon aria-hidden="true" className="size-7 shrink-0" />
          {t('chat.talk')}
        </button>
      </div>
    </div>
  )
}
