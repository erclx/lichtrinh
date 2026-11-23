import '@/i18n/setup'

import type { VoiceSend } from '@shared/voice.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Composer } from '@/features/chat/composer'
import { applyLanguage } from '@/i18n/setup'
import { failure, fakeApi, json } from '@/test/fake-api'
import { aFakeStream, FakeMediaRecorder, type FakeTrack } from '@/test/media'

interface Options {
  running?: boolean
  offline?: boolean
  voiceOnline?: boolean | null
  empty?: boolean
  accepted?: boolean
}

function renderComposer({
  running = false,
  offline = false,
  voiceOnline = null,
  empty = false,
  accepted = true,
}: Options = {}) {
  const onSend = vi.fn(async (_text: string, _voice?: VoiceSend) => accepted)
  const onStop = vi.fn()
  const client = new QueryClient()
  const composer = (voice: boolean | null) => (
    <QueryClientProvider client={client}>
      <Composer
        running={running}
        offline={offline}
        voiceOnline={voice}
        empty={empty}
        contactName={null}
        onSend={onSend}
        onStop={onStop}
      />
    </QueryClientProvider>
  )
  const { rerender } = render(composer(voiceOnline))
  return {
    onSend,
    onStop,
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
