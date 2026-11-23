import {
  readStoredLanguage,
  resolveInitialLanguage,
  storeLanguage,
} from './language'

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError')
  }
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  }
}

describe('resolveInitialLanguage', () => {
  it('opens production in Vietnamese with nothing stored and no account', () => {
    expect(resolveInitialLanguage({ stored: null, isProduction: true })).toBe(
      'vi',
    )
  })

  it('opens development in English with nothing stored and no account', () => {
    expect(resolveInitialLanguage({ stored: null, isProduction: false })).toBe(
      'en',
    )
  })

  it('takes the account language over the build default', () => {
    expect(
      resolveInitialLanguage({
        stored: null,
        account: 'en',
        isProduction: true,
      }),
    ).toBe('en')
  })

  it('takes the device choice over the account language', () => {
    expect(
      resolveInitialLanguage({
        stored: 'vi',
        account: 'en',
        isProduction: false,
      }),
    ).toBe('vi')
  })

  it('falls through a null account to the build default', () => {
    expect(
      resolveInitialLanguage({
        stored: null,
        account: null,
        isProduction: true,
      }),
    ).toBe('vi')
  })
})

describe('readStoredLanguage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads back a stored choice', () => {
    storeLanguage('vi')

    expect(readStoredLanguage()).toBe('vi')
  })

  it('reads a value that is no language as nothing stored', () => {
    localStorage.setItem('lichtrinh.language', 'fr')

    expect(readStoredLanguage()).toBeNull()
  })

  it('reads storage that throws as nothing stored', () => {
    expect(readStoredLanguage(throwingStorage())).toBeNull()
  })
})

describe('storeLanguage', () => {
  it('swallows storage that throws', () => {
    expect(() => storeLanguage('en', throwingStorage())).not.toThrow()
  })
})
