import { SquareIcon } from 'lucide-react'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { watchLevel } from '@/features/chat/voice/level'
import type { TalkState } from '@/features/chat/voice/talk'
import { useMediaQuery } from '@/hooks/use-media-query'

interface ListeningBarProps {
  state: TalkState
  /** The open microphone, read for the level while listening. */
  stream: MediaStream | null
  onStop: () => void
}

// Each bar's share of the level, so the row reads as a voice rather than a meter.
const PROFILE = [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.45, 0.9, 0.6, 0.8, 0.4, 0.55]
const RESTING = 0.5

/**
 * The message row while the mic holds it: a starting line, then a level bar
 * with Stop, then a writing-down line until the words land. The words carry
 * the state, so under reduced motion the bar and the dot hold still.
 */
export function ListeningBar({ state, stream, onStop }: ListeningBarProps) {
  const { t } = useTranslation()
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  const bars = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const row = bars.current
    if (still || stream === null || row === null) return
    return watchLevel(stream, (level) => {
      row.style.setProperty('--level', String(level))
    })
  }, [still, stream])

  if (state.phase === 'transcribing') {
    return (
      <div className="flex min-h-target min-w-0 flex-1 flex-col justify-center gap-1 px-1">
        <p className="flex items-center gap-3 text-base">
          <span
            aria-hidden="true"
            data-testid="writing-dot"
            className="size-3 shrink-0 rounded-full bg-foreground motion-safe:animate-pulse"
          />
          {t('talk.transcribing')}
        </p>
        {state.capped && (
          <p className="text-sm text-muted-foreground">{t('talk.capped')}</p>
        )}
        {state.slow && (
          <p className="text-sm text-muted-foreground">{t('talk.slow')}</p>
        )}
      </div>
    )
  }

  const listening = state.phase === 'listening'

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {listening && (
        <span
          ref={bars}
          aria-hidden="true"
          data-testid="level-bar"
          data-still={still}
          style={{ '--level': RESTING } as CSSProperties}
          className="flex h-10 shrink-0 items-center gap-[5px] px-1"
        >
          {PROFILE.map((share, index) => (
            <i
              // The profile is fixed, so its order never changes.
              key={index}
              style={{ '--share': share } as CSSProperties}
              className="h-[calc(100%*(0.2+0.8*var(--share)*var(--level)))] w-1 rounded-full bg-foreground"
            />
          ))}
        </span>
      )}
      <p className="min-w-0 flex-1 text-base text-muted-foreground">
        {listening ? t('talk.listening') : t('talk.starting')}
      </p>
      <button
        type="button"
        onClick={onStop}
        aria-label={t('talk.stop')}
        className="inline-flex size-target shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none data-[listening=true]:ring-6 data-[listening=true]:ring-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        data-listening={listening}
      >
        <SquareIcon aria-hidden="true" className="size-5" fill="currentColor" />
      </button>
    </div>
  )
}
