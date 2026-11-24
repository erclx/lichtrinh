import type { RouteObject } from 'react-router'

import { EntryDetail } from '@/features/entries/entry-detail'
import { AddEntryPage, EditEntryPage } from '@/features/entries/entry-form'

export const routes: RouteObject[] = [
  { path: 'entries/new', element: <AddEntryPage /> },
  { path: 'entries/:entryId', element: <EntryDetail /> },
  { path: 'entries/:entryId/edit', element: <EditEntryPage /> },
]
