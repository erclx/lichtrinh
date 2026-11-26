import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { PasswordOnce } from '@/features/accounts/password-once'
import { applyLanguage } from '@/i18n/setup'
import { isHeld } from '@/update/holds'

/** The caller's side, which drops the password on Done. */
function ShownOnce() {
  const [shown, setShown] = useState(true)
  if (!shown) return <p>Back on the list</p>
  return (
    <PasswordOnce
      title="New account"
      name="Thành viên"
      password="kmtrpqwx"
      onDone={() => setShown(false)}
    />
  )
}

beforeEach(async () => {
  await applyLanguage('en')
})

describe('PasswordOnce', () => {
  it('holds a release until Done drops the password', async () => {
    const user = userEvent.setup()
    render(<ShownOnce />)
    expect(isHeld()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByText('Back on the list')).toBeInTheDocument()
    expect(isHeld()).toBe(false)
  })
})
