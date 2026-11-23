import { readStoredLanguage } from './language'
import { applyLanguage, chooseLanguage } from './setup'

beforeEach(async () => {
  await applyLanguage('en')
  localStorage.clear()
})

describe('applyLanguage', () => {
  it('sets the page language', async () => {
    await applyLanguage('vi')

    expect(document.documentElement).toHaveAttribute('lang', 'vi')
  })

  it('leaves the device choice unwritten, so an account language never pins itself', async () => {
    await applyLanguage('vi')

    expect(readStoredLanguage()).toBeNull()
  })
})

describe('chooseLanguage', () => {
  it('remembers the choice on the device', async () => {
    await chooseLanguage('vi')

    expect(readStoredLanguage()).toBe('vi')
  })
})
