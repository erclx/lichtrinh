import { MicIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

interface MicButtonProps {
  /** Voice or the whole workspace PC is off, which a card above explains. */
  off: boolean
  /** Why it is off, read out while it is. */
  reason: string
  onTap: () => void
}

/**
 * The mic between the box and Send. Drawn off rather than hidden when voice
 * is offline, so the row keeps its shape, and kept focusable so its reason
 * reads out.
 */
export function MicButton({ off, reason, onTap }: MicButtonProps) {
  const { t } = useTranslation()
  const reasonId = useId()

  return (
    <>
      <button
        type="button"
        onClick={off ? undefined : onTap}
        aria-label={t('talk.mic')}
        aria-disabled={off}
        aria-describedby={off ? reasonId : undefined}
        className="inline-flex size-target shrink-0 items-center justify-center rounded-full bg-muted text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-border aria-disabled:opacity-50 [@media(hover:hover)]:hover:bg-border"
      >
        <MicIcon aria-hidden="true" className="size-7" strokeWidth={2.2} />
      </button>
      {off && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  )
}
