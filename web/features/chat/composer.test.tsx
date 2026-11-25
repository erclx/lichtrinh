import '@/i18n/setup'

import type { VoiceSend } from '@shared/voice.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Composer } from '@/features/chat/composer'
import { applyLanguage } from '@/i18n/setup'
import { onReach, onUnauthenticated } from '@/lib/api'
import { failure, fakeApi, json } from '@/test/fake-api'
import {
  aFakeStream,
  FakeMediaRecorder,
  type FakeTrack,
  setVisibility,
} from '@/test/media'

interface Options {
  running?: boolean
  offline?: boolean
  connected?: boolean
  voiceOnline?: boolean | null
  empty?: boolean
  accepted?: boolean
}

function renderComposer({
  running = false,
  offline = false,
  connected = true,
  voiceOnline = null,
  empty = false,
  accepted = true,
}: Options = {}) {
  const onSend = vi.fn(async (_text: string, _voice?: VoiceSend) => accepted)
  const onStop = vi.fn()
  const onLive = vi.fn<(words: string) => void>()
  const client = new QueryClient()
  const composer = (voice: boolean | null) => (
    <QueryClientProvider client={client}>
      <Composer
        running={running}
        offline={offline}
        connected={connected}
        voiceOnline={voice}
        empty={empty}
        contactName={null}
        admin={false}
        onSend={onSend}
        onStop={onStop}
        onLive={onLive}
      />
    </QueryClientProvider>
  )
  const { rerender, unmount } = render(composer(voiceOnline))
  return {
    onSend,
    onStop,
    unmount,
    /** The live words standing now, as the thread would show them. */
    live: () => onLive.mock.lastCall?.[0] ?? '',
    box: screen.getByLabelText('Message the assistant'),
    /** Answers a later status read with this voice state. */
    readVoice: (voice: boolean | null) => rerender(composer(voice)),
  }
}

const clipId = '5c7d1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f'
const clipPath = `PUT /voice/transcriptions/${clipId}`

function aTranscription(text: string) {
  return {
    id: clipId,
    text,
    model: 'qwen3-asr-1.7b',
    audioMs: 2100,
    ms: 900,
  }
}

/** A microphone that opens when asked, or refuses or waits as told. */
function fakeMic(open: () => Promise<MediaStream>) {
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: open },
  })
}

let track: FakeTrack

beforeEach(async () => {
  await applyLanguage('en')
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(clipId)
  const fake = aFakeStream()
  track = fake.track
  fakeMic(async () => fake.stream)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the box', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, '  an pho luc 7 gio  {Enter}')

    expect(onSend).toHaveBeenCalledWith('an pho luc 7 gio', undefined)
    expect(box).toHaveValue('')
  })

  it('sends on the Send button too', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, 'ca phe')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith('ca phe', undefined)
  })

  it('breaks a line on Shift+Enter without sending', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, 'sang{Shift>}{Enter}{/Shift}chieu')

    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('sang\nchieu')
  })

  it('sends nothing for an empty message', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, '   {Enter}')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).not.toHaveBeenCalled()
  })

  it('puts the text back when the send is turned away', async () => {
    const user = userEvent.setup()
    const { box } = renderComposer({ accepted: false })

    await user.type(box, 'ca phe{Enter}')

    expect(box).toHaveValue('ca phe')
  })

  it('shows Stop in place of Send while a turn runs, and Stop ends it', async () => {
    const user = userEvent.setup()
    const { onStop } = renderComposer({ running: true })

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Stop' }))

    expect(onStop).toHaveBeenCalledOnce()
  })

  it('sends nothing on Enter while a turn runs', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer({ running: true })

    await user.type(box, 'ca phe{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })

  it('waits for a connection, whatever else is off', () => {
    const { box } = renderComposer({
      connected: false,
      offline: true,
      voiceOnline: false,
      empty: true,
    })

    expect(box).toBeDisabled()
    expect(box).toHaveAttribute('placeholder', 'Needs a connection')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Talk' }),
    ).toHaveAccessibleDescription('Needs a connection')
    expect(
      screen.queryByRole('heading', { name: 'Voice is offline' }),
    ).toBeNull()
    expect(screen.queryByRole('list', { name: 'Sample requests' })).toBeNull()
  })

  it('turns the box off with the reason while the assistant is offline', () => {
    const { box } = renderComposer({ offline: true })

    expect(box).toBeDisabled()
    expect(box).toHaveAttribute('placeholder', 'Assistant offline')
  })
})

describe('Composer with the mic', () => {
  it('turns the row into the listening bar with Stop', async () => {
    const user = userEvent.setup()
    fakeApi({ 'POST /assistant/warm': () => json(null, 202) })
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Listening…')
    expect(
      screen.getByText('Listening…', { ignore: '[role=status]' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Message the assistant')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Stop and write it down' }),
    ).toBeInTheDocument()
  })

  it('lands the transcript in the box with the review hint and closes the mic', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => json(aTranscription('doi an toi sang 8 gio')),
    })
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )

    const box = await screen.findByLabelText('Message the assistant')
    expect(box).toHaveValue('doi an toi sang 8 gio')
    expect(box).toHaveFocus()
    expect(
      screen.getByText('This is what you said. Fix it if needed, then send.'),
    ).toBeInTheDocument()
    expect(track.stopped).toBe(true)
  })

  it('lands the transcript after typed text with a space', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => json(aTranscription('doi an toi sang 8 gio')),
    })
    const { box } = renderComposer()

    await user.type(box, 'ngay mai ')
    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )

    expect(await screen.findByLabelText('Message the assistant')).toHaveValue(
      'ngay mai doi an toi sang 8 gio',
    )
  })

  it('sends an edited transcript with its id and the share of words changed', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => json(aTranscription('doi an toi sang 8 gio')),
    })
    const { onSend } = renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )
    const box = await screen.findByLabelText('Message the assistant')
    await user.clear(box)
    await user.type(box, 'dời an toi sang 8 gio{Enter}')

    expect(onSend).toHaveBeenCalledWith('dời an toi sang 8 gio', {
      transcriptionId: clipId,
      editRatio: 1 / 6,
    })
    expect(
      screen.queryByText('This is what you said. Fix it if needed, then send.'),
    ).toBeNull()
  })

  it('sends typed text with no voice field', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, 'ca phe{Enter}')

    expect(onSend).toHaveBeenCalledWith('ca phe', undefined)
  })

  it('asks to try again when the clip held no speech', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => json(aTranscription('')),
    })
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )

    expect(
      await screen.findByText(
        'I did not catch that. Tap the mic and try a little slower, or type it.',
        { ignore: '[role=status]' },
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Message the assistant')).toHaveValue('')
  })

  it('shows voice off and keeps typed text when voice goes away mid-clip', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => failure('voice_unavailable', 503),
    })
    const { box } = renderComposer()

    await user.type(box, 'ngay mai')
    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Voice is offline' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Message the assistant')).toHaveValue(
      'ngay mai',
    )
  })

  it('clears voice off once a status read says voice is back', async () => {
    const user = userEvent.setup()
    fakeApi({
      'POST /assistant/warm': () => json(null, 202),
      [clipPath]: () => failure('voice_unavailable', 503),
    })
    const { readVoice } = renderComposer()
    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      await screen.findByRole('button', { name: 'Stop and write it down' }),
    )
    await screen.findByRole('heading', { name: 'Voice is offline' })

    readVoice(true)

    expect(
      screen.queryByRole('heading', { name: 'Voice is offline' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Talk' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })

  it('says how to allow the mic when it is refused', async () => {
    const user = userEvent.setup()
    fakeApi({ 'POST /assistant/warm': () => json(null, 202) })
    fakeMic(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))

    expect(
      await screen.findByRole('heading', {
        name: 'The microphone is off for this app',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Message the assistant')).toBeEnabled()
  })

  it('records nothing when Stop comes before the mic opens', async () => {
    const user = userEvent.setup()
    fakeApi({ 'POST /assistant/warm': () => json(null, 202) })
    const late = aFakeStream()
    let grant: (stream: MediaStream) => void = () => undefined
    fakeMic(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    )
    renderComposer()

    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await user.click(
      screen.getByRole('button', { name: 'Stop and write it down' }),
    )
    grant(late.stream)

    expect(
      await screen.findByLabelText('Message the assistant'),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(late.track.stopped).toBe(true))
    expect(screen.queryByText('Listening…')).toBeNull()
  })

  it('draws the mic off with its reason and still sends typed text while voice is off', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer({ voiceOnline: false })

    const mic = screen.getByRole('button', { name: 'Talk' })
    expect(mic).toHaveAttribute('aria-disabled', 'true')
    expect(mic).toHaveAccessibleDescription(
      'Talk is off while voice is offline',
    )
    await user.click(mic)
    await user.type(box, 'ca phe{Enter}')

    expect(screen.queryByText('Listening…')).toBeNull()
    expect(onSend).toHaveBeenCalledWith('ca phe', undefined)
  })

  it('shows the hint and fills the box from a sample on an empty thread', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer({ empty: true })

    expect(
      screen.getByText(
        'Tap the mic to talk and again to stop. Or type, or tap a sample.',
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '“Move dinner to 8 pm”' }),
    )

    expect(box).toHaveValue('Move dinner to 8 pm')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('leaves out the hint and the samples while voice is off', () => {
    renderComposer({ empty: true, voiceOnline: false })

    expect(
      screen.getByRole('heading', { name: 'Voice is offline' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Tap the mic to talk/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Sample requests' })).toBeNull()
  })
})

const livePath = `PUT /voice/live/${clipId}?from=0`
const warmed = { 'POST /assistant/warm': () => json(null, 202) }

describe('Composer with live words', () => {
  const stopButton = () =>
    screen.findByRole('button', { name: 'Stop and write it down' })

  // The composer hands words up in an effect, which can run after the box shows.
  const cleared = (live: () => string) =>
    vi.waitFor(() => expect(live()).toBe(''))

  async function listen(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Talk' }))
    await screen.findByText('Listening…', { ignore: '[role=status]' })
  }

  it('hands the words up while the traveler still speaks', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
    })
    const { live } = renderComposer()

    await listen(user)

    await vi.waitFor(() => expect(live()).toBe('doi an toi'))
    expect(await stopButton()).toBeInTheDocument()
  })

  it('keeps the words through transcribing and clears them on landing', async () => {
    const user = userEvent.setup()
    let land: (answer: Response) => void = () => undefined
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
      [clipPath]: () =>
        new Promise<Response>((resolve) => {
          land = resolve
        }),
    })
    const { live } = renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(live()).toBe('doi an toi'))

    await user.click(await stopButton())
    await screen.findByText('Writing down what you said…', {
      ignore: '[role=status]',
    })
    const whileWriting = live()
    land(json(aTranscription('doi an toi sang 8 gio')))

    expect(await screen.findByLabelText('Message the assistant')).toHaveValue(
      'doi an toi sang 8 gio',
    )
    expect(whileWriting).toBe('doi an toi')
    await cleared(live)
  })

  it('clears the words when the clip fails', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
      [clipPath]: () => failure('voice_failed', 502),
    })
    const { live } = renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(live()).toBe('doi an toi'))

    await user.click(await stopButton())
    await screen.findByLabelText('Message the assistant')

    await cleared(live)
  })

  it('clears the words when the page hides and drops the clip', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
    })
    const { live } = renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(live()).toBe('doi an toi'))

    setVisibility('hidden')
    await screen.findByLabelText('Message the assistant')
    setVisibility('visible')

    await cleared(live)
  })

  /** Keeps the signal of each live request, beside the fake API. */
  function watchLiveSignals() {
    const signals: AbortSignal[] = []
    const answer = globalThis.fetch
    vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
      if (input.includes('/voice/live/') && init.signal) {
        signals.push(init.signal)
      }
      return answer(input, init)
    })
    return signals
  }

  const unanswered = () => new Promise<Response>(() => undefined)

  it('drops the piece in flight on Stop', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: unanswered,
      [clipPath]: () => json(aTranscription('doi an toi sang 8 gio')),
    })
    const signals = watchLiveSignals()
    renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(signals).toHaveLength(1))

    await user.click(await stopButton())

    expect(signals[0].aborted).toBe(true)
    expect(await screen.findByLabelText('Message the assistant')).toHaveValue(
      'doi an toi sang 8 gio',
    )
  })

  it('drops the piece in flight when the thread unmounts', async () => {
    const user = userEvent.setup()
    fakeApi({ ...warmed, [livePath]: unanswered })
    const signals = watchLiveSignals()
    const { unmount } = renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(signals).toHaveLength(1))

    unmount()

    expect(signals[0].aborted).toBe(true)
  })

  it('never lets a late answer from one tap reach the next', async () => {
    const user = userEvent.setup()
    const answers: ((response: Response) => void)[] = []
    fakeApi({
      ...warmed,
      [livePath]: () =>
        new Promise<Response>((resolve) => {
          answers.push(resolve)
        }),
    })
    const { live } = renderComposer()
    await listen(user)
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    setVisibility('hidden')
    await screen.findByLabelText('Message the assistant')
    setVisibility('visible')

    await listen(user)
    await vi.waitFor(() => expect(answers).toHaveLength(2))
    answers[0](json({ text: 'First turn', heard: 1 }))
    answers[1](json({ text: 'Second turn', heard: 1 }))

    await vi.waitFor(() => expect(live()).toBe('Second turn'))
  })

  it.each([
    ['voice goes away', () => failure('voice_unavailable', 503)],
    ['the piece is refused', () => failure('voice_failed', 502)],
    ['the session lapses', () => failure('unauthenticated', 401)],
    [
      'no answer arrives',
      () => {
        throw new Error('offline')
      },
    ],
    ['the answer is not one it knows', () => json({ words: 'doi' })],
  ])('changes nothing else when %s', async (_, answer) => {
    const user = userEvent.setup()
    const lapsed = vi.fn()
    const reached = vi.fn()
    const stopLapsed = onUnauthenticated(lapsed)
    const stopReached = onReach((ok) => reached(ok))
    const { requests } = fakeApi({
      ...warmed,
      [livePath]: answer,
      [clipPath]: () => json(aTranscription('doi an toi sang 8 gio')),
    })
    const { live } = renderComposer({ voiceOnline: null })

    await listen(user)
    await vi.waitFor(() =>
      expect(requests.map((one) => one.path)).toContain(
        `/voice/live/${clipId}?from=0`,
      ),
    )
    const notice = screen.queryByRole('heading')
    await user.click(await stopButton())

    expect(await screen.findByLabelText('Message the assistant')).toHaveValue(
      'doi an toi sang 8 gio',
    )
    expect(notice).toBeNull()
    expect(live()).toBe('')
    expect(lapsed).not.toHaveBeenCalled()
    expect(reached).not.toHaveBeenCalledWith(false)
    stopLapsed()
    stopReached()
  })

  it('leaves a screen reader on Listening, never the words', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
    })
    const { live } = renderComposer()

    await listen(user)
    await vi.waitFor(() => expect(live()).toBe('doi an toi'))

    expect(screen.getByRole('status')).toHaveTextContent('Listening…')
  })

  it('steps the samples aside for the words on an empty thread', async () => {
    const user = userEvent.setup()
    fakeApi({
      ...warmed,
      [livePath]: () => json({ text: 'doi an toi', heard: 1 }),
    })
    const { live } = renderComposer({ empty: true })

    await listen(user)
    await vi.waitFor(() => expect(live()).toBe('doi an toi'))

    expect(screen.queryByRole('list', { name: 'Sample requests' })).toBeNull()
  })
})
