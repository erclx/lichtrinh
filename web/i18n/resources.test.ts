import { en } from './locales/en'
import { vi } from './locales/vi'

type Tree = { readonly [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : leaves(value, path)
  })
}

describe('the message modules', () => {
  it('hold the same keys in Vietnamese and English', () => {
    const viKeys = leaves(vi)
      .map(([path]) => path)
      .sort()
    const enKeys = leaves(en)
      .map(([path]) => path)
      .sort()

    expect(viKeys).toEqual(enKeys)
  })

  it.each([
    ['en', en],
    ['vi', vi],
  ])('leave no %s entry empty', (_language, messages) => {
    const empty = leaves(messages).filter(([, value]) => value.trim() === '')

    expect(empty).toEqual([])
  })
})
