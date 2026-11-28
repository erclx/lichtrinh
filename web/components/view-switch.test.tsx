import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GridIcon, ListIcon } from '@/shell/icons'

import { ViewSwitch } from './view-switch'

const options = [
  { value: 'grid', label: 'Grid', icon: GridIcon },
  { value: 'list', label: 'List', icon: ListIcon },
] as const

function renderSwitch(onChange: (value: string) => void = () => {}) {
  render(
    <ViewSwitch
      label="Layout"
      options={options}
      value="grid"
      onChange={onChange}
    />,
  )
}

describe('ViewSwitch', () => {
  it('presses the chosen option alone, under its name', () => {
    renderSwitch()

    expect(screen.getByRole('group', { name: 'Layout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports the other option when it is chosen', async () => {
    const onChange = vi.fn()
    renderSwitch(onChange)

    await userEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(onChange).toHaveBeenCalledWith('list')
  })

  it('keeps the chosen option on when it is pressed again', async () => {
    const onChange = vi.fn()
    renderSwitch(onChange)

    await userEvent.click(screen.getByRole('button', { name: 'Grid' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
