import type { RouteObject } from 'react-router'

import { TripForm } from '@/features/trips/trip-form'
import { TripList } from '@/features/trips/trip-list'
import { TripOverview } from '@/features/trips/trip-overview'

export const routes: RouteObject[] = [
  { path: 'trips', element: <TripList /> },
  { path: 'trips/new', element: <TripForm /> },
  { path: 'trips/:tripId', element: <TripOverview /> },
]
