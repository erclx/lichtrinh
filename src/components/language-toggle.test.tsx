import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LanguageToggle } from '@/components/language-toggle'
import { readStoredLanguage } from '@/i18n/language'
import { changeLanguage } from '@/i18n/setup'

beforeEach(async () => {
  await changeLanguage('en')
  localStorage.clear()
})

describe('LanguageToggle', () => {
  it('marks the active language pressed and the other not', () => {
    render(<LanguageToggle />)

    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Tiếng Việt/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('moves the pressed state to the language pressed', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)

    await user.click(screen.getByRole('button', { name: /Tiếng Việt/ }))

    expect(screen.getByRole('button', { name: /Tiếng Việt/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('sets the page language to the one pressed', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)

    await user.click(screen.getByRole('button', { name: /Tiếng Việt/ }))

    expect(document.documentElement).toHaveAttribute('lang', 'vi')
  })

  it('remembers the language pressed on the device', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)

    await user.click(screen.getByRole('button', { name: /Tiếng Việt/ }))

    expect(readStoredLanguage()).toBe('vi')
  })

  it('keeps the group findable in Vietnamese by its bilingual label', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)

    await user.click(screen.getByRole('button', { name: /Tiếng Việt/ }))

    expect(
      screen.getByRole('group', { name: 'Language / Ngôn ngữ' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['VI Tiếng Việt', 'vi'],
    ['EN English', 'en'],
  ])('speaks %s in the language it names', (name, lang) => {
    render(<LanguageToggle />)

    expect(screen.getByRole('button', { name })).toHaveAttribute('lang', lang)
  })
})
