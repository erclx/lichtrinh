import type { RouteObject } from 'react-router'

import { ChatListPage } from '@/features/chat/chat-list-page'
import { ThreadPage } from '@/features/chat/thread-page'

export const routes: RouteObject[] = [
  { path: 'chats', element: <ChatListPage /> },
  { path: 'chats/:chatId', element: <ThreadPage /> },
]
