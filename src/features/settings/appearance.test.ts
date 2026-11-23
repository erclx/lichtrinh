import {
  chooseAppearance,
  readAppearance,
  resolveTheme,
  storeAppearance,
} from './appearance'

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

function deviceScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
  }))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveTheme', () => {
  it('follows a dark device on Auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
  })

  it('follows a light device on Auto', () => {
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('keeps Light on a dark device', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('keeps Dark on a light device', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('readAppearance', () => {
  it('reads Auto when nothing is stored', () => {
    expect(readAppearance()).toBe('auto')
  })

  it('reads back a stored choice', () => {
    storeAppearance('dark')

    expect(readAppearance()).toBe('dark')
  })

  it('reads an unknown stored value as Auto', () => {
    localStorage.setItem('lichtrinh.theme', 'sepia')

    expect(readAppearance()).toBe('auto')
  })

  it('reads Auto when storage throws', () => {
    expect(readAppearance(throwingStorage())).toBe('auto')
  })
})

describe('chooseAppearance', () => {
  it('themes a light device dark at once on Dark', () => {
    deviceScheme(false)

    chooseAppearance('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readAppearance()).toBe('dark')
  })

  it('returns to the device scheme on Auto', () => {
    deviceScheme(true)
    chooseAppearance('light')

    chooseAppearance('auto')

    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('still themes the page when storage throws', () => {
    deviceScheme(false)

    chooseAppearance('dark', throwingStorage())

    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
