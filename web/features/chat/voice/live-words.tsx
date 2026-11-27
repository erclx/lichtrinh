import { cn } from '@/lib/utils'

interface LiveWordsProps {
  text: string
  /** How the composer sits under the thread, which sets the gap above it. */
  layout: 'page' | 'panel'
}

// The words the model may still change as it hears more.
const NEWEST = 8

/**
 * The words so far, standing on the composer whatever the thread's scroll,
 * newest at the bottom and older ones muted. A screen reader skips them,
 * hearing the mic's state and the landed line.
 */
export function LiveWords({ text, layout }: LiveWordsProps) {
  const words = text.trim().split(/\s+/)
  const older = words.slice(0, -NEWEST).join(' ')
  const newest = words.slice(-NEWEST).join(' ')

  return (
    <p
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-full text-xl/[1.4] font-bold wrap-anywhere text-foreground',
        // Past the composer's own padding and border, to the same clear line.
        layout === 'panel' ? 'pb-[--spacing(8.375)]' : 'pb-6',
      )}
    >
      {older !== '' && (
        <>
          <span data-older="" className="text-muted-foreground">
            {older}
          </span>{' '}
        </>
      )}
      <span data-newest="">{newest}</span>
    </p>
  )
}

/** The ground the words stand on, over the thread's rows. */
export function LiveGround() {
  return <div aria-hidden="true" className="absolute inset-0 bg-background" />
}

/** Fades the oldest words at the top of whatever part of the thread shows. */
export function LiveFade() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none sticky top-0 z-10 h-0"
    >
      <div className="h-27.5 bg-linear-to-b from-background to-transparent" />
    </div>
  )
}
