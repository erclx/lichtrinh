import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SwipeRow } from '@/components/swipe-row'
import { applyLanguage } from '@/i18n/setup'

type User = ReturnType<typeof userEvent.setup>

/** Presses on the row at (x, y), moves to (x + dx, y + dy), and lets go. */
async function drag(user: User, target: Element, dx: number, dy: number) {
  const x = 300
  const y = 40
  await user.pointer([
    { keys: '[TouchA>]', target, coords: { clientX: x, clientY: y } },
    {
      pointerName: 'TouchA',
      target,
      coords: { clientX: x + dx / 2, clientY: y + dy / 2 },
    },
    {
      pointerName: 'TouchA',
      target,
      coords: { clientX: x + dx, clientY: y + dy },
    },
    { keys: '[/TouchA]', target },
  ])
}

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SwipeRow', () => {
  it('keeps Delete out of reach until the row is swiped', () => {
    render(
      <SwipeRow onDelete={() => {}}>
        <p>Flower market</p>
      </SwipeRow>,
    )

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('reveals Delete on a left drag, which calls the caller', async () => {
    const user = userEvent.setup()
    const deleted: string[] = []
    render(
      <SwipeRow onDelete={() => deleted.push('flower market')}>
        <p>Flower market</p>
      </SwipeRow>,
    )

    await drag(user, screen.getByText('Flower market'), -90, 2)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleted).toEqual(['flower market'])
  })

  it('springs back shut on a left drag shorter than half the button', async () => {
    const user = userEvent.setup()
    render(
      <SwipeRow onDelete={() => {}}>
        <p>Flower market</p>
      </SwipeRow>,
    )

    await drag(user, screen.getByText('Flower market'), -30, 0)

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('leaves the row shut on a mostly vertical drag', async () => {
    const user = userEvent.setup()
    render(
      <SwipeRow onDelete={() => {}}>
        <p>Flower market</p>
      </SwipeRow>,
    )

    await drag(user, screen.getByText('Flower market'), -60, 120)

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('closes on a tap elsewhere', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SwipeRow onDelete={() => {}}>
          <p>Flower market</p>
        </SwipeRow>
        <button type="button">Add</button>
      </>,
    )
    await drag(user, screen.getByText('Flower market'), -90, 0)

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('closes on a tap on the swiped row without opening it', async () => {
    const user = userEvent.setup()
    const opened: string[] = []
    render(
      <SwipeRow onDelete={() => {}}>
        <button type="button" onClick={() => opened.push('flower market')}>
          Flower market
        </button>
      </SwipeRow>,
    )
    await drag(user, screen.getByText('Flower market'), -90, 0)

    await user.click(screen.getByRole('button', { name: 'Flower market' }))

    expect(opened).toEqual([])
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('offers no swiped Delete from 1024px up', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 1024px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const user = userEvent.setup()
    render(
      <SwipeRow onDelete={() => {}}>
        <p>Flower market</p>
      </SwipeRow>,
    )

    await drag(user, screen.getByText('Flower market'), -90, 0)

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})
