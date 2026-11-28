import { act, renderHook } from '@testing-library/react'

import { readChoice, storeChoice, useDeviceChoice } from './device-choice'

const layouts = ['grid', 'list'] as const

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

beforeEach(() => {
  localStorage.clear()
})

describe('readChoice', () => {
  it('reads the default when nothing is stored', () => {
    expect(readChoice('layout', layouts, 'grid')).toBe('grid')
  })

  it('reads back a stored choice under its own key', () => {
    storeChoice('layout', 'list')

    expect(readChoice('layout', layouts, 'grid')).toBe('list')
    expect(localStorage.getItem('lichtrinh.layout')).toBe('list')
  })

  it('reads a value that is not an option as the default', () => {
    localStorage.setItem('lichtrinh.layout', 'mosaic')

    expect(readChoice('layout', layouts, 'grid')).toBe('grid')
  })

  it('reads the default when storage throws', () => {
    expect(readChoice('layout', layouts, 'list', throwingStorage())).toBe(
      'list',
    )
  })

  it('stores nothing and throws nothing when storage throws', () => {
    expect(() => storeChoice('layout', 'list', throwingStorage())).not.toThrow()
  })
})

describe('useDeviceChoice', () => {
  it('follows a changing default until a choice is made', () => {
    const { result, rerender } = renderHook(
      ({ fallback }) => useDeviceChoice('layout', layouts, fallback),
      { initialProps: { fallback: 'list' as (typeof layouts)[number] } },
    )
    expect(result.current[0]).toBe('list')

    rerender({ fallback: 'grid' })

    expect(result.current[0]).toBe('grid')
  })

  it('keeps a made choice at every default and remembers it', () => {
    const { result, rerender } = renderHook(
      ({ fallback }) => useDeviceChoice('layout', layouts, fallback),
      { initialProps: { fallback: 'grid' as (typeof layouts)[number] } },
    )

    act(() => result.current[1]('list'))
    rerender({ fallback: 'grid' })

    expect(result.current[0]).toBe('list')
    expect(readChoice('layout', layouts, 'grid')).toBe('list')
  })
})
