import { cn } from '@/lib/utils'

interface LiveWordsProps {
  text: string
  /** How the thread beneath scrolls, which decides where the words stand. */
  layout: 'page' | 'panel'
}

// The words the model may still change as it hears more.
const NEWEST = 8

/**
 * The words so far over a thread, newest at the bottom and older ones muted.
 * A screen reader skips them, hearing the mic's state and the landed line.
 */
export function LiveWords({ text, layout }: LiveWordsProps) {
  const words = text.trim().split(/\s+/)
  const older = words.slice(0, -NEWEST).join(' ')
  const newest = words.slice(-NEWEST).join(' ')

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col justify-end bg-background"
    >
      <div
        className={cn(
          'flex flex-col justify-end overflow-hidden mask-[linear-gradient(transparent,black_110px)]',
          layout === 'panel'
            ? 'h-full px-4 pb-4'
            : // The window scrolls a page, so the words hold above its composer.
              'sticky bottom-[calc(72px+max(16px,env(safe-area-inset-bottom)))] h-[calc(100svh-88px)] max-h-full pb-4',
        )}
      >
        <p className="text-xl/[1.4] font-bold wrap-anywhere text-foreground">
          {older !== '' && (
            <>
              <span data-older="" className="text-muted-foreground">
                {older}
              </span>{' '}
            </>
          )}
          <span data-newest="">{newest}</span>
        </p>
      </div>
    </div>
  )
}
