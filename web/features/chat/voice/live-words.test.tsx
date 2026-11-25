import { render } from '@testing-library/react'

import { LiveWords } from '@/features/chat/voice/live-words'

function renderWords(text: string) {
  const { container } = render(<LiveWords text={text} layout="panel" />)
  return {
    panel: container.firstElementChild,
    older: container.querySelector('[data-older]'),
    newest: container.querySelector('[data-newest]'),
  }
}

describe('LiveWords', () => {
  it('keeps a short turn whole in the ink', () => {
    const { older, newest } = renderWords('mot hai ba bon nam sau bay tam')

    expect(newest).toHaveTextContent(/^mot hai ba bon nam sau bay tam$/)
    expect(older).toBeNull()
  })

  it('mutes every word but the last eight', () => {
    const { older, newest } = renderWords(
      'mot hai ba bon nam sau bay tam chin muoi',
    )

    expect(older).toHaveTextContent(/^mot hai$/)
    expect(older).toHaveClass('text-muted-foreground')
    expect(newest).toHaveTextContent(/^ba bon nam sau bay tam chin muoi$/)
  })

  it('reads a run of spaces as one gap', () => {
    const { newest } = renderWords('  mot   hai ')

    expect(newest).toHaveTextContent(/^mot hai$/)
  })

  it('is hidden from a screen reader', () => {
    const { panel } = renderWords('mot hai')

    expect(panel).toHaveAttribute('aria-hidden', 'true')
  })
})
