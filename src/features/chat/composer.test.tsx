import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Composer } from '@/features/chat/composer'
import { applyLanguage } from '@/i18n/setup'

interface Options {
  running?: boolean
  offline?: boolean
  accepted?: boolean
}

function renderComposer({
  running = false,
  offline = false,
  accepted = true,
}: Options = {}) {
  const onSend = vi.fn(async (_text: string) => accepted)
  const onStop = vi.fn()
  render(
    <Composer
      running={running}
      offline={offline}
      onSend={onSend}
      onStop={onStop}
    />,
  )
  return { onSend, onStop, box: screen.getByLabelText('Message the assistant') }
}

beforeEach(async () => {
  await applyLanguage('en')
})

describe('Composer', () => {
  it('sends the trimmed text on Enter and clears the box', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, '  an pho luc 7 gio  {Enter}')

    expect(onSend).toHaveBeenCalledWith('an pho luc 7 gio')
    expect(box).toHaveValue('')
  })

  it('sends on the Send button too', async () => {
    const user = userEvent.setup()
    const { onSend, box } = renderComposer()

    await user.type(box, 'ca phe')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith('ca phe')
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
