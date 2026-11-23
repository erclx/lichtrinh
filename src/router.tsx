import type { RouteObject } from 'react-router'

import { AccountsPage } from '@/features/accounts/accounts-page'
import { CreateAccountPage } from '@/features/accounts/create-account-page'
import { EditAccountPage } from '@/features/accounts/edit-account-page'
import { AssistantSettingsPage } from '@/features/assistant-settings/assistant-settings-page'
import { ChatListPage } from '@/features/chat/chat-list-page'
import { ThreadPage } from '@/features/chat/thread-page'
import { DayPage } from '@/features/day/day-view'
import { EntryDetail } from '@/features/entries/entry-detail'
import { AddEntryPage, EditEntryPage } from '@/features/entries/entry-form'
import { SettingsPage } from '@/features/settings/settings-page'
import { TodayScreen } from '@/features/today/today-screen'
import { TripForm } from '@/features/trips/trip-form'
import { TripList } from '@/features/trips/trip-list'
import { TripOverview } from '@/features/trips/trip-overview'
import { SessionGate } from '@/session/gate'
import { RequireAdmin } from '@/session/require-admin'
import { AppShell } from '@/shell/app-shell'
import { NotFoundPage } from '@/shell/not-found-page'
import { PlaceholderPage } from '@/shell/placeholder-page'

/**
 * The one route table. A screen row replaces a placeholder's `element` or
 * adds a child under the shell, and renames none of the paths here.
 */
export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <TodayScreen /> },
          { path: 'trips', element: <TripList /> },
          { path: 'trips/new', element: <TripForm /> },
          { path: 'trips/:tripId', element: <TripOverview /> },
          { path: 'trips/:tripId/days/:date', element: <DayPage /> },
          { path: 'entries/new', element: <AddEntryPage /> },
          { path: 'entries/:entryId', element: <EntryDetail /> },
          { path: 'entries/:entryId/edit', element: <EditEntryPage /> },
          {
            path: 'calendar',
            element: <PlaceholderPage titleKey="nav.calendar" />,
          },
          { path: 'chats', element: <ChatListPage /> },
          { path: 'chats/:chatId', element: <ThreadPage /> },
          { path: 'settings', element: <SettingsPage /> },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <NotFoundPage /> },
              { path: 'accounts', element: <AccountsPage /> },
              { path: 'accounts/new', element: <CreateAccountPage /> },
              { path: 'accounts/:id', element: <EditAccountPage /> },
              { path: 'assistant', element: <AssistantSettingsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
