import { render, screen } from '@testing-library/react'

import { ToggleGroup, ToggleGroupItem } from './toggle-group'

describe('ToggleGroupItem', () => {
  it('reaches the tap target as a pill over the kit sizes', () => {
    render(
      <ToggleGroup value={['on']}>
        <ToggleGroupItem value="on">On</ToggleGroupItem>
      </ToggleGroup>,
    )

    const item = screen.getByRole('button', { name: 'On' })
    expect(item).toHaveClass('h-target', 'rounded-full', 'text-base')
    expect(item).not.toHaveClass('h-8', 'rounded-lg', 'text-sm')
  })
})
