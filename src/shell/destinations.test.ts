import { visibleDestinations } from '@/shell/destinations'

describe('visibleDestinations', () => {
  it('gives a member no Accounts entry', () => {
    const paths = visibleDestinations('member').map(({ path }) => path)

    expect(paths).not.toContain('/admin/accounts')
    expect(paths).toEqual(['/', '/trips', '/calendar', '/settings'])
  })

  it('gives the admin the Accounts entry', () => {
    const paths = visibleDestinations('admin').map(({ path }) => path)

    expect(paths).toContain('/admin/accounts')
  })
})
