import { render, screen } from '@testing-library/react'

import { Button } from './button'

describe('Button at its default size', () => {
  it('keeps the label color beside the label size', () => {
    render(<Button>Add</Button>)

    expect(screen.getByRole('button')).toHaveClass(
      'text-base',
      'text-primary-foreground',
    )
  })

  it('reaches the tap target on the field radius', () => {
    render(<Button>Add</Button>)

    const button = screen.getByRole('button')
    expect(button).toHaveClass('h-target', 'rounded-lg')
    expect(button).not.toHaveClass('rounded-full')
  })
})
