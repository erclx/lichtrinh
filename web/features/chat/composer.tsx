import type { VoiceSend } from '@shared/voice.ts'
import { ArrowRightIcon, SquareIcon } from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { editRatio } from '@/features/chat/voice/edit-ratio'
import { ListeningBar } from '@/features/chat/voice/listening-bar'
import { MicButton } from '@/features/chat/voice/mic-button'
import { isRecording, type TalkState } from '@/features/chat/voice/talk'
import { useTalk } from '@/features/chat/voice/use-talk'
import {
  MicDeniedCard,
  TalkLine,
  VoiceOffCard,
} from '@/features/chat/voice/voice-notice'
import { cn } from '@/lib/utils'
import { safeWhenEmpty, useHold } from '@/update/holds'

interface ComposerProps {
  /** A turn is running, so Stop replaces Send and Enter sends nothing. */
  running: boolean
  /** The workspace PC is off, which the offline card above explains. */
  offline: boolean
  /** The app reaches the API. Without it the row waits, whatever else is off. */
  connected: boolean
  /**
   * Whether voice answers, from the status read. False draws the mic off,
   * and null, from an API reporting no voice, leaves it on.
   */
  voiceOnline: boolean | null
  /** The thread holds nothing yet, so the hint and the samples show. */
  empty: boolean
  /** Whom the voice-off card asks, or null for the admin. */
  contactName: string | null
  /** The reader is an admin, whose voice-off card has nobody to tell. */
  admin: boolean
  /** Resolves false when the send was turned away, putting the text back. */
  onSend: (text: string, voice?: VoiceSend) => Promise<boolean>
  onStop: () => void
  /** Gets the words so far while the traveler speaks, and empty text after. */
  onLive: (words: string) => void
}

const round =
  'inline-flex size-target shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50'

const SAMPLES = [
  'talk.sampleCoffee',
  'talk.sampleDinner',
  'talk.sampleTaxi',
  'talk.sampleCost',
] as const

/**
 * The message box under a thread, with the mic between it and Send. Enter
 * sends and Shift+Enter breaks a line. A transcript lands after any typed
 * text, to fix before Send, and the voice notices sit just above the row.
 */
export function Composer({
  running,
  offline,
  connected,
  voiceOnline,
  empty,
  contactName,
  admin,
  onSend,
  onStop,
  onLive,
}: ComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  // The box right after the words landed, which the edit ratio reads.
  const [landed, setLanded] = useState<string | null>(null)
  const typedBefore = useRef('')
  const box = useRef<HTMLTextAreaElement>(null)
  const talk = useTalk((words) => {
    const next =
      typedBefore.current === '' ? words : `${typedBefore.current} ${words}`
    setText(next)
    setLanded(next)
  })
  const recording = isRecording(talk.state)
  const blocked = offline || !connected
  // A clip lives in no field, so a reload would drop it unseen.
  useHold(recording)

  useEffect(() => {
    if (talk.state.phase === 'review') box.current?.focus()
  }, [talk.state])

  useEffect(() => {
    onLive(talk.words)
  }, [onLive, talk.words])

  function tapMic() {
    // A second clip in review replaces the first, after the same typed text.
    if (talk.state.phase !== 'review') typedBefore.current = text.trim()
    void talk.tap()
  }

  async function submit() {
    const asked = text.trim()
    if (running || blocked || recording || asked === '') return
    const voice =
      talk.state.phase === 'review' && landed !== null
        ? {
            transcriptionId: talk.state.transcriptionId,
            editRatio: editRatio(landed, asked),
          }
        : undefined
    setText('')
    const accepted = await onSend(asked, voice)
    if (!accepted) {
      setText((typed) => (typed === '' ? asked : typed))
      return
    }
    setLanded(null)
    talk.sent()
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

  function pickSample(sample: string) {
    setText(sample)
    box.current?.focus()
  }

  const placeholder = !connected
    ? t('offline.needsConnection')
    : offline
      ? t('chat.offlinePlaceholder')
      : running
        ? t('chat.workingPlaceholder')
        : t('chat.messagePlaceholder')

  // A failed clip shows voice off until a status read says otherwise.
  const voiceOff =
    !blocked &&
    (voiceOnline === false ||
      (voiceOnline === null && talk.state.phase === 'off'))
  const guide = empty && !blocked && !voiceOff
  const showSamples =
    guide && text === '' && talk.state.phase !== 'review' && talk.words === ''

  return (
    <div className="flex flex-col gap-3">
      {voiceOff && <VoiceOffCard contactName={contactName} admin={admin} />}
      {talk.state.phase === 'denied' && <MicDeniedCard />}
      <Notice state={talk.state} hint={guide} />
      {showSamples && (
        <ul aria-label={t('talk.samplesLabel')} className="flex flex-col gap-2">
          {SAMPLES.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => pickSample(t(key))}
                className="min-h-12 w-full rounded-lg border-2 border-border bg-card px-4 py-2.5 text-left text-base font-bold text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted [@media(hover:hover)]:hover:bg-muted"
              >
                “{t(key)}”
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2.5"
        {...safeWhenEmpty}
      >
        {recording ? (
          <ListeningBar
            state={talk.state}
            stream={talk.stream}
            onStop={talk.stop}
          />
        ) : (
          <>
            <textarea
              ref={box}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              disabled={blocked}
              rows={1}
              aria-label={t('chat.messageLabel')}
              placeholder={placeholder}
              className={cn(
                'field-sizing-content max-h-40 min-h-target min-w-0 flex-1 resize-none rounded-lg border-2 border-input bg-card px-4 py-3.75 text-base text-card-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                // Keeps the longest reason on one line beside the two buttons.
                !connected && 'placeholder:text-sm',
              )}
            />
            <MicButton
              off={blocked || voiceOnline === false}
              reason={t(connected ? 'talk.micOff' : 'offline.needsConnection')}
              onTap={tapMic}
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
                disabled={blocked}
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
          </>
        )}
      </form>
      <p role="status" className="sr-only">
        {announcement(talk.state, t)}
      </p>
    </div>
  )
}

function Notice({ state, hint }: { state: TalkState; hint: boolean }) {
  const { t } = useTranslation()

  if (state.phase === 'review') {
    return (
      <>
        <TalkLine>{t('talk.review')}</TalkLine>
        {state.capped && <TalkLine>{t('talk.capped')}</TalkLine>}
      </>
    )
  }
  if (state.phase === 'retry') return <TalkLine>{t('talk.retry')}</TalkLine>
  if (state.phase === 'failed') return <TalkLine>{t('talk.failed')}</TalkLine>
  if (state.phase === 'ready' && hint) {
    return <TalkLine>{t('talk.hint')}</TalkLine>
  }
  return null
}

function announcement(
  state: TalkState,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (state.phase) {
    case 'starting':
      return t('talk.starting')
    case 'listening':
      return t('talk.listening')
    case 'transcribing':
      return t('talk.transcribing')
    case 'review':
      return t('talk.landed')
    case 'retry':
      return t('talk.retry')
    case 'failed':
      return t('talk.failed')
    case 'off':
      return t('talk.offTitle')
    case 'denied':
      return t('talk.deniedTitle')
    case 'ready':
      return ''
  }
}
