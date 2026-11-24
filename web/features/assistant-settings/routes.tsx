import type { RouteObject } from 'react-router'

import { AssistantSettingsPage } from '@/features/assistant-settings/assistant-settings-page'

export const adminRoutes: RouteObject[] = [
  { path: 'assistant', element: <AssistantSettingsPage /> },
]
