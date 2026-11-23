import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlusIcon } from '@/shell/icons'

interface NoTripsProps {
  title: string
  body: string
}

/**
 * The empty calendar from `canon/design/onboarding/`, shown by Today and the
 * trips list. The practice trip's button waits for its own row.
 */
export function NoTrips({ title, body }: NoTripsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 pt-10 text-center">
      <BrandMark className="size-28" />
      <h2 className="pt-2 font-heading text-xl font-extrabold">{title}</h2>
      <p className="max-w-[34ch] text-base text-muted-foreground">{body}</p>
      <Link to="/trips/new" className={cn(buttonVariants(), 'mt-2 w-full')}>
        <PlusIcon />
        {t('trips.newTrip')}
      </Link>
    </div>
  )
}
