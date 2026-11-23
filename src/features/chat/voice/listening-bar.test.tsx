import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ListeningBar } from '@/features/chat/voice/listening-bar'
import type { TalkState } from '@/features/chat/voice/talk'
import { applyLanguage } from '@/i18n/setup'
import { aFakeStream } from '@/test/media'

function renderBar(state: TalkState) {
  const onStop = vi.fn()
  render(
    <ListeningBar
      state={state}
      stream={aFakeStream().stream}
      onStop={onStop}
    />,
  )
  return { onStop }
}

/** Matches the reduced motion query alone, as a phone set to it does. */
function preferReducedMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ListeningBar', () => {
  it('says the mic is opening, with Stop to cancel', async () => {
    const user = userEvent.setup()
    const { onStop } = renderBar({ phase: 'starting' })

    expect(screen.getByText('Opening the microphone…')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Stop and write it down' }),
    )

    expect(onStop).toHaveBeenCalledOnce()
  })

  it('says it is listening beside the level bar and Stop', () => {
    renderBar({ phase: 'listening' })

    expect(screen.getByText('Listening…')).toBeInTheDocument()
    expect(screen.getByTestId('level-bar')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Stop and write it down' }),
    ).toBeInTheDocument()
  })

  it('says it is writing down, with no Stop', () => {
    renderBar({ phase: 'transcribing', capped: false, slow: false })

    expect(screen.getByText('Writing down what you said…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says a slow first clip takes longer and a capped one stopped at a minute', () => {
    renderBar({ phase: 'transcribing', capped: true, slow: true })

    expect(screen.getByText('Stopped at one minute.')).toBeInTheDocument()
    expect(
      screen.getByText('The first one after a break takes a little longer.'),
    ).toBeInTheDocument()
  })

  it('holds the bar and the dot still under reduced motion', () => {
    preferReducedMotion()
    renderBar({ phase: 'listening' })

    expect(screen.getByTestId('level-bar')).toHaveAttribute(
      'data-still',
      'true',
    )
  })
})
