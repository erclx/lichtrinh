import { ArrowRightIcon, SquareIcon } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface ComposerProps {
  /** A turn is running, so Stop replaces Send and Enter sends nothing. */
  running: boolean
  /** The workspace PC is off, which the offline card above explains. */
  offline: boolean
  /** Resolves false when the send was turned away, putting the text back. */
  onSend: (text: string) => Promise<boolean>
  onStop: () => void
}

const round =
  'inline-flex size-target shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50'

/**
 * The message box under a thread. Enter sends and Shift+Enter breaks a
 * line. The mic lands beside Send in its own row, so the box leaves the
 * room for it rather than drawing it.
 */
export function Composer({ running, offline, onSend, onStop }: ComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  async function submit() {
    const asked = text.trim()
    if (running || offline || asked === '') return
    setText('')
    const accepted = await onSend(asked)
    if (!accepted) setText((typed) => (typed === '' ? asked : typed))
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    // An input method composing Vietnamese uses Enter to commit a word.
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void submit()
  }

  const placeholder = offline
    ? t('chat.offlinePlaceholder')
    : running
      ? t('chat.workingPlaceholder')
      : t('chat.messagePlaceholder')

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2.5">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={offline}
        rows={1}
        aria-label={t('chat.messageLabel')}
        placeholder={placeholder}
        className={cn(
          'field-sizing-content max-h-40 min-h-target min-w-0 flex-1 resize-none rounded-lg border-2 border-input bg-card px-4 py-[15px] text-base text-card-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
        )}
      />
      {running ? (
        <button
          type="button"
          onClick={onStop}
          aria-label={t('chat.stop')}
          className={round}
        >
          <SquareIcon
            aria-hidden="true"
            className="size-5"
            fill="currentColor"
          />
        </button>
      ) : (
        <button
          type="submit"
          disabled={offline}
          aria-label={t('chat.send')}
          className={round}
        >
          <ArrowRightIcon
            aria-hidden="true"
            className="size-7"
            strokeWidth={2.6}
          />
        </button>
      )}
    </form>
  )
}
