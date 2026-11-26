import type { OwnerMessage } from '@shared/owner.ts'
import { render, screen, within } from '@testing-library/react'

import type { AppView } from '../state.ts'
import { Messages } from './messages.tsx'

// Local times, since the page prints the PC's own clock.
const NOW = new Date(2031, 10, 22, 14, 24)
const at = (hour: number, minute: number) =>
  new Date(2031, 10, 22, hour, minute).toISOString()

function message(fields: Partial<OwnerMessage> & { id: string }): OwnerMessage {
  return {
    at: at(14, 21),
    role: 'user',
    text: 'thêm ăn phở sáng mai lúc 7 giờ',
    status: 'complete',
    model: null,
    ...fields,
  }
}

function read(messages: OwnerMessage[]): Extract<AppView, { reach: 'read' }> {
  return {
    reach: 'read',
    activity: { count: messages.length, failed: 0, lastAt: null },
    messages,
  }
}

const rows = () => screen.getAllByRole('listitem')

describe('Messages', () => {
  it('lists the rows in the order the app gave, newest first', () => {
    render(
      <Messages
        app={read([
          message({
            id: 'reply',
            role: 'assistant',
            text: 'Xong.',
            model: 'lichtrinh-assistant',
          }),
          message({ id: 'ask', text: 'thêm ăn phở' }),
          message({ id: 'older', at: at(11, 38), text: 'mai co gi' }),
        ])}
        now={NOW}
      />,
    )

    expect(rows().map((row) => row.textContent)).toEqual([
      '14:21ReplyXong.lichtrinh-assistant',
      '14:21Messagethêm ăn phở',
      '11:38Messagemai co gi',
    ])
  })

  it('marks the family’s text as Vietnamese', () => {
    render(
      <Messages
        app={read([message({ id: 'ask', text: 'mai co gi' })])}
        now={NOW}
      />,
    )

    expect(screen.getByText('mai co gi')).toHaveAttribute('lang', 'vi')
  })

  it('names the model on a reply and none on a message', () => {
    render(
      <Messages
        app={read([
          message({
            id: 'reply',
            role: 'assistant',
            text: 'Xong.',
            model: 'lichtrinh-assistant-gemma',
          }),
          message({ id: 'ask' }),
        ])}
        now={NOW}
      />,
    )

    const [reply, ask] = rows()
    expect(reply).toHaveTextContent('lichtrinh-assistant-gemma')
    expect(ask).not.toHaveTextContent('lichtrinh')
  })

  it('says a failed reply in words, in English', () => {
    render(
      <Messages
        app={read([
          message({
            id: 'reply',
            role: 'assistant',
            text: '',
            status: 'failed',
            model: 'lichtrinh-assistant',
          }),
        ])}
        now={NOW}
      />,
    )

    const note = within(rows()[0] as HTMLElement).getByText(
      'No reply, the turn failed',
    )
    expect(note).toHaveAttribute('lang', 'en')
  })

  it('keeps a stopped reply’s text and says it stopped', () => {
    render(
      <Messages
        app={read([
          message({
            id: 'reply',
            role: 'assistant',
            text: 'Đang thêm',
            status: 'stopped',
            model: 'lichtrinh-assistant',
          }),
        ])}
        now={NOW}
      />,
    )

    expect(screen.getByText('Đang thêm')).toBeVisible()
    expect(screen.getByText('Stopped partway')).toBeVisible()
  })

  it('says there are no messages yet, with no list', () => {
    render(<Messages app={read([])} now={NOW} />)

    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText(/No messages yet/)).toBeVisible()
  })

  it('says the app cannot be reached, with no rows', () => {
    render(<Messages app={{ reach: 'unreachable' }} now={NOW} />)

    expect(screen.queryByRole('list')).toBeNull()
    expect(
      screen.getByText(/The app cannot be reached from this PC/),
    ).toBeVisible()
  })
})
