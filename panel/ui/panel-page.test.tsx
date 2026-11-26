import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import type { PanelState, ServiceState, ServiceStatus } from '../state.ts'
import { PanelPage } from './panel-page.tsx'

const NOW = new Date(2031, 10, 22, 14, 24)

function service(
  id: ServiceState['id'],
  status: ServiceStatus,
  cause: ServiceState['cause'] = null,
): ServiceState {
  return {
    id,
    status,
    cause,
    since: null,
    restarts: 0,
    freesAt: null,
    logs: [{ at: NOW.toISOString(), event: null, text: `a line of ${id}` }],
  }
}

function state(
  statuses: Partial<Record<ServiceState['id'], ServiceStatus>> = {},
): PanelState {
  const of = (id: ServiceState['id'], fallback: ServiceStatus) => {
    const status = statuses[id] ?? fallback
    return service(id, status, status === 'failed' ? 'exited' : null)
  }
  return {
    readAt: NOW.toISOString(),
    services: [
      of('voice', 'up'),
      of('model', 'up'),
      of('bridge', 'up'),
      of('staging', 'stopped'),
    ],
    gpu: {
      totalMiB: 32_768,
      usedMiB: 26_521,
      models: [{ alias: 'lichtrinh-assistant', vramMiB: 22_630 }],
    },
    app: { reach: 'unset' },
  }
}

type PageProps = Parameters<typeof PanelPage>[0]

function page(shown: PanelState, props: Partial<PageProps> = {}) {
  const onPress = vi.fn<PageProps['onPress']>()
  const element = (next: PanelState) => (
    <PanelPage
      state={next}
      stale={false}
      pending={[]}
      failure={null}
      onPress={onPress}
      {...props}
    />
  )
  const { rerender } = render(element(shown))
  return {
    onPress,
    user: userEvent.setup(),
    read: (next: PanelState) => rerender(element(next)),
  }
}

const tileNames = () =>
  screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)

describe('the tiles', () => {
  it('keep their order while nothing failed', () => {
    page(state())

    expect(tileNames()).toEqual(['Voice', 'Local model', 'Bridge', 'Staging'])
  })

  it('put a failed service first, with its log lines beside its button', () => {
    page(state({ bridge: 'failed' }))

    expect(tileNames()).toEqual(['Bridge', 'Voice', 'Local model', 'Staging'])
    const bridge = within(screen.getByRole('region', { name: 'Bridge' }))
    expect(bridge.getByText(/a line of bridge/)).toBeVisible()
    expect(bridge.getByRole('button', { name: 'Start Bridge' })).toBeVisible()
  })

  it('keep a stopped service in its place', () => {
    page(state({ bridge: 'stopped' }))

    expect(tileNames()).toEqual(['Voice', 'Local model', 'Bridge', 'Staging'])
  })

  it('ask for their own action', async () => {
    const { user, onPress } = page(state())

    await user.click(screen.getByRole('button', { name: 'Unload Local model' }))

    expect(onPress).toHaveBeenCalledWith({
      on: 'service',
      id: 'model',
      action: 'unload',
    })
  })

  it('say a failed action on the tile it was asked of', () => {
    page(state(), {
      failure: { on: 'service', id: 'bridge', action: 'restart' },
    })

    const bridge = within(screen.getByRole('region', { name: 'Bridge' }))
    expect(bridge.getByRole('alert')).toHaveTextContent(
      'Bridge did not restart. Its log lines say why.',
    )
  })

  it('hold one tile while its own press runs, and no other', () => {
    page(state(), {
      pending: [{ on: 'service', id: 'bridge', action: 'restart' }],
    })

    expect(
      screen.getByRole('button', { name: 'Restart Bridge' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('button', { name: 'Restart Voice' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
  })
})

describe('the verdict', () => {
  it('starts the one service that is down', async () => {
    const { user, onPress } = page(state({ voice: 'failed' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Voice is down' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Start voice' }))

    expect(onPress).toHaveBeenCalledWith({
      on: 'service',
      id: 'voice',
      action: 'start',
    })
  })

  it('says a failed Start all under its line', () => {
    page(state(), { failure: { on: 'all', action: 'start' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Not everything started.',
    )
  })
})

describe('Stop all', () => {
  // A key pressed before the dialog takes focus reaches the button behind it.
  const openDialog = async (shown = state()) => {
    const opened = page(shown)
    const trigger = screen.getByRole('button', { name: 'Stop all' })
    await opened.user.click(trigger)
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Keep running' }),
      ).toHaveFocus(),
    )
    return { ...opened, trigger, dialog }
  }

  it('opens on Keep running and stops nothing yet', async () => {
    const { dialog, onPress } = await openDialog()

    expect(
      within(dialog).getByRole('button', { name: 'Keep running' }),
    ).toHaveFocus()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('stops everything on its own button', async () => {
    const { dialog, onPress, user } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Stop all' }))

    expect(onPress).toHaveBeenCalledWith({ on: 'all', action: 'stop' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it.each([
    ['Escape', '{Escape}'],
    ['Enter on Keep running', '{Enter}'],
  ])(
    'closes on %s with everything running, back on its button',
    async (_, key) => {
      const { user, onPress, trigger } = await openDialog()

      await user.keyboard(key)

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onPress).not.toHaveBeenCalled()
      await waitFor(() => expect(trigger).toHaveFocus())
    },
  )

  it('names staging while its bridge runs', async () => {
    const { dialog } = await openDialog(state({ staging: 'up' }))

    expect(dialog).toHaveAccessibleDescription(
      'Chat and talk will be off for the family until you start it again. The staging bridge stops too.',
    )
  })
})

describe('the keyboard', () => {
  it('stays on a tile whose failure clears and whose button goes', async () => {
    const { user, read } = page(state({ bridge: 'failed' }))
    screen.getByRole('button', { name: 'Start Bridge' }).focus()
    await user.keyboard('{Enter}')

    read(state({ bridge: 'starting' }))

    const bridge = screen.getByRole('region', { name: 'Bridge' })
    expect(bridge).toContainElement(document.activeElement as HTMLElement)
  })

  it('stays on a tile left with no button of its own', async () => {
    const { user, read } = page(state({ voice: 'stopped' }))
    screen.getByRole('button', { name: 'Start Voice' }).focus()
    await user.keyboard('{Enter}')

    const elsewhere = state()
    elsewhere.services[0] = service('voice', 'up', 'elsewhere')
    read(elsewhere)

    const voice = within(screen.getByRole('region', { name: 'Voice' }))
    expect(
      voice.getByRole('button', { name: /Recent log lines/ }),
    ).toHaveFocus()
  })

  it('leaves the page unfocused after a click on nothing', async () => {
    const { user, read } = page(state())
    await user.click(screen.getByRole('button', { name: 'Restart Voice' }))

    await user.click(document.body)
    read(state({ bridge: 'starting' }))

    expect(document.body).toHaveFocus()
  })
})

describe('the graphics card', () => {
  const card = () => screen.getByRole('region', { name: 'Graphics card' })

  it('splits its memory into the model, the rest, and what is free', () => {
    page(state())

    expect(card()).toHaveTextContent(
      'Local model22.1Other, voice included3.8Free6.1 of 32 GiB',
    )
  })

  it('names each alias when the card holds two', () => {
    const shown = state()
    page({
      ...shown,
      gpu: {
        totalMiB: 32_768,
        usedMiB: 30_720,
        models: [
          { alias: 'lichtrinh-assistant', vramMiB: 20_480 },
          { alias: 'lichtrinh-assistant-gemma', vramMiB: 8_192 },
        ],
      },
    })

    expect(card()).toHaveTextContent(
      'lichtrinh-assistant20.0lichtrinh-assistant-gemma8.0Other, voice included2.0',
    )
  })

  it('never shows less than nothing when the card reads behind Ollama', () => {
    const shown = state()
    page({
      ...shown,
      gpu: {
        totalMiB: 32_768,
        usedMiB: 4_096,
        models: [{ alias: 'lichtrinh-assistant', vramMiB: 22_630 }],
      },
    })

    expect(card()).toHaveTextContent('Other, voice included0.0')
  })

  it('says when the card cannot be read', () => {
    page({ ...state(), gpu: null })

    expect(card()).toHaveTextContent('The graphics card is not answering.')
  })
})

it('says the panel has no fresh read, and when what shows was read', () => {
  page(state(), { stale: true })

  expect(screen.getByRole('alert')).toHaveTextContent(
    'The panel cannot read this PC, so this is from Sat 22 Nov 2031, 14:24.',
  )
})
