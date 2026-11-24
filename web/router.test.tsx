import { isValidElement } from 'react'
import type { RouteObject } from 'react-router'

import { routes } from '@/router'
import { RequireAdmin } from '@/session/require-admin'

const modules = Object.entries(
  import.meta.glob<Record<string, RouteObject[]>>('./features/*/routes.tsx', {
    eager: true,
  }),
)

interface Page {
  path: string
  behindAdminCheck: boolean
}

function isAdminCheck({ element }: RouteObject): boolean {
  return isValidElement(element) && element.type === RequireAdmin
}

// Every page with its full path, a parameter's own name dropped, since two
// names for one parameter still claim one address.
function pages(list: RouteObject[], parent = '', isAdmin = false): Page[] {
  return list.flatMap((route) => {
    const path = `${parent}/${route.path ?? ''}`
      .replace(/\/+/g, '/')
      .replace(/:\w+/g, ':')
    const behindAdminCheck = isAdmin || isAdminCheck(route)
    return route.children === undefined
      ? [{ path: path.replace(/(.)\/$/, '$1'), behindAdminCheck }]
      : pages(route.children, path, behindAdminCheck)
  })
}

describe('the route table', () => {
  it('finds the features', () => {
    expect(modules).not.toEqual([])
  })

  it.each(modules)('reads every export of %s', (_file, module) => {
    const unread = Object.keys(module).filter(
      (name) => name !== 'routes' && name !== 'adminRoutes',
    )

    expect(unread).toEqual([])
    expect(Object.values(module).flat()).not.toEqual([])
  })

  it('gives each path to one page', () => {
    const paths = pages(routes).map(({ path }) => path)

    expect(paths).toEqual([...new Set(paths)])
  })

  it('keeps every admin page behind the admin check', () => {
    const admin = pages(routes).filter(({ path }) => /^\/admin\b/.test(path))

    expect(admin).not.toEqual([])
    expect(admin.filter(({ behindAdminCheck }) => !behindAdminCheck)).toEqual(
      [],
    )
  })
})
