import type { Trip } from '@shared/trips.ts'
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const all = 'all'

interface TripFilterProps {
  trips: Trip[]
  /** The trip the calendar narrows to, or null for every trip. */
  selected: string | null
  onSelect: (trip: Trip | null) => void
}

/** All trips, then each trip, as one row of chips scrolling sideways. */
export function TripFilter({ trips, selected, onSelect }: TripFilterProps) {
  const { t } = useTranslation()

  return (
    <div className="-mx-4">
      <ToggleGroup
        aria-label={t('calendar.tripsLabel')}
        value={[selected ?? all]}
        onValueChange={([next]) => {
          // Pressing the chip already on reports no value, which keeps it on.
          if (next === undefined) return
          onSelect(trips.find((trip) => trip.id === next) ?? null)
        }}
        spacing={2}
        className="scroll-px-4 overflow-x-auto rounded-none bg-transparent px-4 py-1 [scrollbar-width:none]"
      >
        {[{ id: all, name: t('calendar.allTrips') }, ...trips].map((chip) => (
          <ToggleGroupItem
            key={chip.id}
            value={chip.id}
            className="flex-none bg-muted px-5 whitespace-nowrap"
          >
            {chip.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
