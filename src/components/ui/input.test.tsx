import { render, screen } from '@testing-library/react'

import { Input } from './input'

describe('Input', () => {
  it('reaches the tap target on the field radius at body size', () => {
    render(<Input aria-label="Username" />)

    const input = screen.getByRole('textbox', { name: 'Username' })
    expect(input).toHaveClass('h-target', 'rounded-lg', 'text-base')
    expect(input).not.toHaveClass('h-8', 'md:text-sm')
  })
})
