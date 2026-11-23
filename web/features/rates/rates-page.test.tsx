import '@/i18n/setup'

import type { Rate } from '@shared/rates.ts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aTrip } from '@/test/calendar'
import { aUser, failure, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const storedUsd: Rate = {
  from: 'USD',
  to: 'VND',
  rate: '25500',
  updatedAt: '2031-05-01T03:00:00.000Z',
}

function serve(
  rates: Rate[],
  extra: Parameters<typeof fakeApi>[0] = {},
  role: 'admin' | 'member' = 'admin',
) {
  return fakeApi({
    'GET /auth/me': () => json(aUser({ role })),
    'GET /trips': () => json({ trips: [aTrip()] }),
    'GET /rates': () => json({ rates }),
    ...extra,
  })
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RatesPage', () => {
  it('opens a pair with no rate home currency first', async () => {
    serve([])

    renderRoute('/admin/rates')

    const field = await screen.findByRole('textbox', {
      name: 'How many VND one USD buys',
    })
    expect(field).toHaveValue('')
    expect(screen.getByText('No rate yet')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument()
  })

  it('saves a typed rate for the pair', async () => {
    const user = userEvent.setup()
    const api = serve([], {
      'PUT /admin/rates/USD/VND': () => json(storedUsd),
    })
    renderRoute('/admin/rates')

    await user.type(
      await screen.findByRole('textbox', { name: 'How many VND one USD buys' }),
      '25,500',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Rate saved.')).toBeInTheDocument()
    expect(api.requests).toContainEqual({
      method: 'PUT',
      path: '/admin/rates/USD/VND',
      body: { rate: '25500' },
    })
  })

  it('saves in the swapped direction', async () => {
    const user = userEvent.setup()
    const api = serve([], {
      'PUT /admin/rates/VND/USD': () =>
        json({ ...storedUsd, from: 'VND', to: 'USD', rate: '0.0000392' }),
    })
    renderRoute('/admin/rates')

    await user.click(
      await screen.findByRole('button', { name: 'Swap to 1 VND first' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'How many USD one VND buys' }),
      '0.0000392',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Rate saved.')).toBeInTheDocument()
    expect(api.requests).toContainEqual({
      method: 'PUT',
      path: '/admin/rates/VND/USD',
      body: { rate: '0.0000392' },
    })
  })

  it('refuses a rate of zero and keeps it as typed', async () => {
    const user = userEvent.setup()
    const api = serve([])
    renderRoute('/admin/rates')
    const field = await screen.findByRole('textbox', {
      name: 'How many VND one USD buys',
    })

    await user.type(field, '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveValue('0')
    expect(screen.getByText(/^Enter a number above zero/)).toBeInTheDocument()
    expect(api.requests.some(({ method }) => method === 'PUT')).toBe(false)
  })

  it('keeps a value the API refuses as typed', async () => {
    const user = userEvent.setup()
    serve([], {
      'PUT /admin/rates/USD/VND': () => failure('validation_failed', 400),
    })
    renderRoute('/admin/rates')
    const field = await screen.findByRole('textbox', {
      name: 'How many VND one USD buys',
    })

    await user.type(field, '1234567.890123')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText(/^Enter a number above zero/),
    ).toBeInTheDocument()
    expect(field).toHaveValue('1234567.890123')
  })

  it('shows a stored rate with its date and clears it', async () => {
    const user = userEvent.setup()
    const api = serve([storedUsd], {
      'DELETE /admin/rates/USD/VND': () => new Response(null, { status: 204 }),
    })
    renderRoute('/admin/rates')

    expect(
      await screen.findByRole('textbox', { name: 'How many VND one USD buys' }),
    ).toHaveValue('25500')
    expect(screen.getByText('Set on 5/1/2031')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(await screen.findByText('Rate cleared.')).toBeInTheDocument()
    expect(api.requests).toContainEqual({
      method: 'DELETE',
      path: '/admin/rates/USD/VND',
      body: undefined,
    })
  })

  it('lists no pair for a trip priced in its home currency', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser({ role: 'admin' })),
      'GET /trips': () =>
        json({ trips: [aTrip({ currency: 'USD', homeCurrency: 'USD' })] }),
      'GET /rates': () => json({ rates: [] }),
    })

    renderRoute('/admin/rates')

    expect(await screen.findByText(/^No trip uses two/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('reads a Vietnamese decimal comma', async () => {
    await applyLanguage('vi')
    const user = userEvent.setup()
    const api = serve([], {
      'PUT /admin/rates/USD/VND': () => json(storedUsd),
    })
    renderRoute('/admin/rates')

    await user.type(
      await screen.findByRole('textbox', { name: 'Số VND đổi được 1 USD' }),
      '25.500,5',
    )
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(await screen.findByText('Đã lưu tỷ giá.')).toBeInTheDocument()
    expect(api.requests).toContainEqual({
      method: 'PUT',
      path: '/admin/rates/USD/VND',
      body: { rate: '25500.5' },
    })
  })

  it('shows a member the not-found page', async () => {
    serve([], {}, 'member')

    renderRoute('/admin/rates')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['vi', 'Số VND đổi được 1 USD', 'Lưu', '1.08'],
    ['en', 'How many VND one USD buys', 'Save', '1,5'],
  ] as const)(
    'refuses the other language’s decimal mark in %s',
    async (language, fieldName, saveName, typed) => {
      await applyLanguage(language)
      const user = userEvent.setup()
      const api = serve([])
      renderRoute('/admin/rates')
      const field = await screen.findByRole('textbox', { name: fieldName })

      await user.type(field, typed)
      await user.click(screen.getByRole('button', { name: saveName }))

      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveValue(typed)
      expect(api.requests.some(({ method }) => method === 'PUT')).toBe(false)
    },
  )
})
