import '@/i18n/setup'

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aTrip } from '@/test/calendar'
import { aUser, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const created = aTrip({
  id: 'trip-new',
  name: 'Home visit to Hồ Bạc',
  startsOn: '2031-09-20',
  endsOn: '2031-09-24',
})

function tripRoutes(post = () => json({ trip: created, changeId: 'c1' }, 201)) {
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips': () => json({ trips: [] }),
    'POST /trips': post,
    'GET /trips/trip-new': () => json({ trip: created, entries: [] }),
  })
}

async function pickDates(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^From/ }))
  const sheet = await screen.findByRole('dialog', { name: 'Trip dates' })
  await user.click(within(sheet).getByRole('button', { name: '20' }))
  await user.click(within(sheet).getByRole('button', { name: '24' }))
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
  // Only the clock is faked, so the sheet opens on September 2031.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2031-09-15T03:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TripForm', () => {
  it('refuses a missing name and sends nothing', async () => {
    const api = tripRoutes()
    const user = userEvent.setup()
    renderRoute('/trips/new')

    await user.click(await screen.findByRole('button', { name: 'Create trip' }))

    expect(screen.getByText('Enter a trip name')).toBeInTheDocument()
    expect(screen.getByLabelText('Trip name')).toHaveFocus()
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('takes both dates from one range sheet', async () => {
    const api = tripRoutes()
    const user = userEvent.setup()
    renderRoute('/trips/new')

    await user.type(await screen.findByLabelText('Trip name'), 'Home visit')
    await pickDates(user)
    expect(
      screen.getByRole('button', { name: 'From 9/20/2031' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'To 9/24/2031' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create trip' }))

    expect(
      await screen.findByRole('heading', { name: 'Home visit to Hồ Bạc' }),
    ).toBeInTheDocument()
    expect(api.requests.find(({ method }) => method === 'POST')?.body).toEqual(
      expect.objectContaining({
        name: 'Home visit',
        startsOn: '2031-09-20',
        endsOn: '2031-09-24',
        currency: 'VND',
        homeCurrency: 'USD',
      }),
    )
  })

  it('starts the local time on the device’s zone', async () => {
    const api = tripRoutes()
    const user = userEvent.setup()
    renderRoute('/trips/new')

    await user.type(await screen.findByLabelText('Trip name'), 'Home visit')
    await pickDates(user)
    await user.click(screen.getByRole('button', { name: 'Create trip' }))
    await screen.findByRole('heading', { name: 'Home visit to Hồ Bạc' })

    expect(api.requests.find(({ method }) => method === 'POST')?.body).toEqual(
      expect.objectContaining({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    )
  })

  it('keeps what was typed when the save fails, and retries with the same id', async () => {
    const api = tripRoutes(offline)
    const user = userEvent.setup()
    renderRoute('/trips/new')

    await user.type(await screen.findByLabelText('Trip name'), 'Home visit')
    await pickDates(user)
    await user.click(screen.getByRole('button', { name: 'Create trip' }))
    await screen.findByText('Not saved yet')
    await user.click(screen.getByRole('button', { name: 'Try saving again' }))
    await screen.findByText('Not saved yet')

    expect(screen.getByLabelText('Trip name')).toHaveValue('Home visit')
    const ids = api.requests
      .filter(({ method }) => method === 'POST')
      .map(({ body }) => (body as { id: string }).id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })
})
