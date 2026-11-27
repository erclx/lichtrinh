import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { useThread } from '@/features/chat/chat-api'
import { Thread } from '@/features/chat/thread'
import { ApiFailure } from '@/lib/api'
import { useSession } from '@/session/session-context'
import { NotFoundPage } from '@/shell/not-found-page'
import { PageHeader } from '@/shell/page-header'

/**
 * One chat as a page, which a phone opens from the Talk bar and any width
 * reaches by its address, with Back to the list.
 */
export function ThreadPage() {
  const { user } = useSession()
  const { chatId = '' } = useParams()
  return user?.canChat === true ? (
    <ThreadScreen key={chatId} chatId={chatId} />
  ) : (
    <NotFoundPage />
  )
}

function ThreadScreen({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const thread = useThread(chatId)

  if (thread.error instanceof ApiFailure && thread.error.code === 'not_found') {
    return <NotFoundPage />
  }

  return (
    // Fills the screen under the top bar, keeping the composer at the foot.
    <div className="flex min-h-[calc(100svh-var(--spacing-target)-var(--spacing)*11)] flex-col">
      <PageHeader
        title={thread.data?.chat.title ?? t('chat.untitled')}
        backTo="/chats"
      />
      <Thread chatId={chatId} layout="page" />
    </div>
  )
}
