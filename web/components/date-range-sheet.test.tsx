import '@/i18n/setup'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { type DateRange, DateRangeSheet } from '@/components/date-range-sheet'
import { applyLanguage } from '@/i18n/setup'

beforeEach(async () => {
  await applyLanguage('en')
})

async function openFrom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^From/ }))
  return screen.findByRole('dialog', { name: 'Trip dates' })
}

describe('DateRangeSheet', () => {
  it('names each field by its label and date', () => {
    render(
      <DateRangeSheet
        from="2031-09-20"
        to="2031-09-24"
        today="2031-09-15"
        onChange={() => {}}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'From 9/20/2031' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'To 9/24/2031' }),
    ).toBeInTheDocument()
  })

  it('takes a first and a last tap and reports both on Done', async () => {
    const user = userEvent.setup()
    const changes: DateRange[] = []
    render(
      <DateRangeSheet
        from={null}
        to={null}
        today="2031-09-15"
        onChange={(range) => changes.push(range)}
      />,
    )
    const sheet = await openFrom(user)

    await user.click(within(sheet).getByRole('button', { name: '20' }))
    await user.click(within(sheet).getByRole('button', { name: '24' }))
    expect(sheet).toHaveTextContent('9/20 to 9/24 · 5 days')
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    expect(changes).toEqual([{ from: '2031-09-20', to: '2031-09-24' }])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('marks both ends of the range pressed', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from="2031-09-20"
        to="2031-09-24"
        today="2031-09-15"
        onChange={() => {}}
      />,
    )

    const sheet = await openFrom(user)

    const pressed = within(sheet)
      .getAllByRole('button', { pressed: true })
      .map((day) => day.textContent)
    expect(pressed).toEqual(['20', '24'])
  })

  it('restarts the range on a third tap', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from="2031-09-20"
        to="2031-09-24"
        today="2031-09-15"
        onChange={() => {}}
      />,
    )
    const sheet = await openFrom(user)

    await user.click(within(sheet).getByRole('button', { name: '10' }))

    expect(sheet).toHaveTextContent('9/10 · now pick the last day')
  })

  it('makes a last tap before the first day the new first day', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from={null}
        to={null}
        today="2031-09-15"
        onChange={() => {}}
      />,
    )
    const sheet = await openFrom(user)

    await user.click(within(sheet).getByRole('button', { name: '20' }))
    await user.click(within(sheet).getByRole('button', { name: '12' }))

    expect(sheet).toHaveTextContent('9/12 · now pick the last day')
  })

  it('takes one tapped day twice as a one-day trip', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from={null}
        to={null}
        today="2031-09-15"
        onChange={() => {}}
      />,
    )
    const sheet = await openFrom(user)

    await user.click(within(sheet).getByRole('button', { name: '20' }))
    await user.click(within(sheet).getByRole('button', { name: '20' }))

    expect(sheet).toHaveTextContent('9/20 to 9/20 · 1 day')
  })

  it('holds Done until both days are set', async () => {
    const user = userEvent.setup()
    const changes: DateRange[] = []
    render(
      <DateRangeSheet
        from={null}
        to={null}
        today="2031-09-15"
        onChange={(range) => changes.push(range)}
      />,
    )
    const sheet = await openFrom(user)
    expect(sheet).toHaveTextContent('Pick the first day')

    await user.click(within(sheet).getByRole('button', { name: '20' }))
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))

    expect(changes).toEqual([])
    expect(within(sheet).getByRole('button', { name: 'Done' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens on the month of the first day', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from="2031-12-03"
        to="2031-12-08"
        today="2031-09-15"
        onChange={() => {}}
      />,
    )

    const sheet = await openFrom(user)

    expect(within(sheet).getByText('December 2031')).toBeInTheDocument()
  })

  it('moves across the year to the next month', async () => {
    const user = userEvent.setup()
    render(
      <DateRangeSheet
        from="2031-12-03"
        to="2031-12-08"
        today="2031-09-15"
        onChange={() => {}}
      />,
    )
    const sheet = await openFrom(user)

    await user.click(within(sheet).getByRole('button', { name: 'Next month' }))

    expect(within(sheet).getByText('January 2032')).toBeInTheDocument()
  })

  it('closes on Escape with no change and returns focus to the field that opened it', async () => {
    const user = userEvent.setup()
    const changes: DateRange[] = []
    render(
      <DateRangeSheet
        from="2031-09-20"
        to="2031-09-24"
        today="2031-09-15"
        onChange={(range) => changes.push(range)}
      />,
    )
    const toField = screen.getByRole('button', { name: 'To 9/24/2031' })
    await user.click(toField)
    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: '10' }))

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(changes).toEqual([])
    expect(toField).toHaveFocus()
  })
})
