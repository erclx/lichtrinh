import { resources } from './resources'

type Tree = { readonly [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : leaves(value, path)
  })
}

const { en, vi } = resources

describe('the messages i18next is handed', () => {
  it('hold the same keys in Vietnamese and English', () => {
    const viKeys = leaves(vi.translation)
      .map(([path]) => path)
      .sort()
    const enKeys = leaves(en.translation)
      .map(([path]) => path)
      .sort()

    expect(enKeys).not.toEqual([])
    expect(viKeys).toEqual(enKeys)
  })

  it.each([
    ['en', en.translation],
    ['vi', vi.translation],
  ])('leave no %s entry empty', (_language, messages) => {
    const empty = leaves(messages).filter(([, value]) => value.trim() === '')

    expect(empty).toEqual([])
  })
})
