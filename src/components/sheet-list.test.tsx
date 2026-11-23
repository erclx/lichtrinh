import '@/i18n/setup'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SheetList, type SheetListOption } from '@/components/sheet-list'
import { applyLanguage } from '@/i18n/setup'

const times: SheetListOption[] = ['14:30', '15:00', '15:30', '16:00'].map(
  (time) => ({ value: time, label: time }),
)

const zones: SheetListOption[] = [
  { value: 'Asia/Bangkok', label: 'Bangkok (GMT+7)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Hồ Chí Minh (GMT+7)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
  { value: 'Europe/Paris', label: 'Paris (GMT+1)' },
]

beforeEach(async () => {
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SheetList', () => {
  it('names its field by the label and the chosen value', () => {
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={() => {}}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Starts 15:00' }),
    ).toBeInTheDocument()
  })

  it('opens from the keyboard on the chosen row, checked and focused', async () => {
    const user = userEvent.setup()
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={() => {}}
      />,
    )

    await user.tab()
    await user.keyboard('{Enter}')

    const chosen = await screen.findByRole('radio', { name: '15:00' })
    expect(chosen).toBeChecked()
    await waitFor(() => expect(chosen).toHaveFocus())
  })

  it('opens on Down Arrow as a dialog holding a radio group named by the label', async () => {
    const user = userEvent.setup()
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={() => {}}
      />,
    )

    await user.tab()
    await user.keyboard('{ArrowDown}')

    const dialog = await screen.findByRole('dialog', { name: 'Starts' })
    expect(dialog).toContainElement(
      screen.getByRole('radiogroup', { name: 'Starts' }),
    )
  })

  it('picks the next row on Down Arrow then Enter and closes', async () => {
    const user = userEvent.setup()
    const picked: string[] = []
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={(value) => picked.push(value)}
      />,
    )
    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '15:00' })).toHaveFocus(),
    )

    await user.keyboard('{ArrowDown}{Enter}')

    expect(picked).toEqual(['15:30'])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('picks a tapped row and closes', async () => {
    const user = userEvent.setup()
    const picked: string[] = []
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={(value) => picked.push(value)}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Starts 15:00' }))

    await user.click(await screen.findByRole('radio', { name: '16:00' }))

    expect(picked).toEqual(['16:00'])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Escape without a pick and returns focus to its field', async () => {
    const user = userEvent.setup()
    const picked: string[] = []
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={(value) => picked.push(value)}
      />,
    )
    await user.tab()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog')

    await user.keyboard('{ArrowDown}{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(picked).toEqual([])
    expect(screen.getByRole('button', { name: 'Starts 15:00' })).toHaveFocus()
  })

  it('narrows the rows to the filter typed without diacritics', async () => {
    const user = userEvent.setup()
    render(
      <SheetList
        label="Local time"
        value="Asia/Bangkok"
        options={zones}
        onChange={() => {}}
        filterable
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Local time Bangkok (GMT+7)' }),
    )

    await user.type(
      await screen.findByRole('searchbox', { name: 'Search the list' }),
      'ho chi',
    )

    expect(screen.getAllByRole('radio').map((row) => row.textContent)).toEqual([
      'Hồ Chí Minh (GMT+7)',
    ])
  })

  it('says when nothing matches and clears the filter on request', async () => {
    const user = userEvent.setup()
    render(
      <SheetList
        label="Local time"
        value="Asia/Bangkok"
        options={zones}
        onChange={() => {}}
        filterable
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Local time Bangkok (GMT+7)' }),
    )
    await user.type(await screen.findByRole('searchbox'), 'zzz')
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear the search' }))

    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })

  it('picks on Enter and returns focus in the wide-screen dialog too', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 480px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const user = userEvent.setup()
    const picked: string[] = []
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={(value) => picked.push(value)}
      />,
    )
    await user.tab()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '15:00' })).toHaveFocus(),
    )

    await user.keyboard('{ArrowUp}{Enter}')

    expect(picked).toEqual(['14:30'])
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Starts 15:00' }),
      ).toHaveFocus(),
    )
  })

  it('shows no filter field unless asked', async () => {
    const user = userEvent.setup()
    render(
      <SheetList
        label="Starts"
        value="15:00"
        options={times}
        onChange={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Starts 15:00' }))

    await screen.findByRole('dialog')
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})
