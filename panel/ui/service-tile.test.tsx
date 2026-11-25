import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import type { ServiceState } from '../state.ts'
import { ServiceTile } from './service-tile.tsx'

const NOW = new Date(2031, 10, 22, 14, 24)

function service(fields: Partial<ServiceState> = {}): ServiceState {
  return {
    id: 'voice',
    status: 'up',
    cause: null,
    since: null,
    restarts: 0,
    freesAt: null,
    logs: [
      {
        at: new Date(2031, 10, 22, 14, 6, 41).toISOString(),
        event: 'failed',
        text: 'exit 1, restart limit reached',
      },
      {
        at: new Date(2031, 10, 22, 14, 6, 40).toISOString(),
        event: null,
        text: 'worker out of memory on load',
      },
    ],
    ...fields,
  }
}

function tile(
  fields: Partial<ServiceState> = {},
  props: Partial<Parameters<typeof ServiceTile>[0]> = {},
) {
  const onAction = vi.fn()
  render(
    <ServiceTile
      service={service(fields)}
      now={NOW}
      busy={false}
      failure={null}
      onAction={onAction}
      {...props}
    />,
  )
  return { onAction, user: userEvent.setup() }
}

const actions = () =>
  screen
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('aria-expanded'))
    .map((button) => button.textContent)

describe('ServiceTile', () => {
  it.each([
    ['up', null, ['Restart', 'Stop']],
    ['failed', 'exited', ['Start']],
    ['failed', 'not_answering', ['Restart', 'Stop']],
    ['stopped', null, ['Start']],
    ['starting', null, ['Starting']],
    ['stopping', null, ['Stopping']],
    ['up', 'elsewhere', []],
  ] as const)('offers for %s (%s) %j', (status, cause, labels) => {
    tile({ status, cause })

    expect(actions()).toEqual(labels)
  })

  it('names its service on every button', async () => {
    const { onAction, user } = tile()

    await user.click(screen.getByRole('button', { name: 'Restart Voice' }))

    expect(onAction).toHaveBeenCalledWith('restart')
  })

  it('holds its buttons while a press runs, and keeps their focus', async () => {
    const { onAction, user } = tile({}, { busy: true })
    const stop = screen.getByRole('button', { name: 'Stop Voice' })

    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')

    expect(stop).toHaveFocus()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('opens a failed service on its log lines, newest first', () => {
    tile({ status: 'failed', cause: 'exited' })

    const lines = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(lines.map((line) => line.textContent)).toEqual([
      '14:06:41 failed exit 1, restart limit reached',
      '14:06:40 worker out of memory on load',
    ])
    expect(
      screen.queryByRole('button', { name: /Recent log lines/ }),
    ).not.toBeInTheDocument()
  })

  it('opens and closes the log lines of a service that is up by keyboard', async () => {
    const { user } = tile()
    const toggle = screen.getByRole('button', { name: /Recent log lines/ })

    toggle.focus()
    await user.keyboard('{Enter}')
    const opened = screen.queryByRole('list')
    await user.keyboard(' ')

    expect(opened).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('says a service has no log lines yet', async () => {
    const { user } = tile({ logs: [] })

    await user.click(screen.getByRole('button', { name: /Recent log lines/ }))

    expect(screen.getByText('No log lines yet')).toBeVisible()
  })

  it('says a failed press beside its button, with the log lines open', () => {
    tile({}, { failure: 'Voice did not restart. Its log lines say why.' })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Voice did not restart.',
    )
    expect(screen.getByRole('list')).toBeVisible()
  })

  it('shows two lines of one instant that read the same', async () => {
    const line = { at: NOW.toISOString(), event: null, text: 'restart 1' }
    const { user } = tile({ logs: [line, line] })

    await user.click(screen.getByRole('button', { name: /Recent log lines/ }))

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
