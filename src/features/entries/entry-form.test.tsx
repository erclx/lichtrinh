import '@/i18n/setup'

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { anEntry, aTrip } from '@/test/calendar'
import { aUser, failure, fakeApi, json } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

type User = ReturnType<typeof userEvent.setup>

const addPath = '/entries/new?trip=trip-river&date=2031-05-15'
const lunch = anEntry({
  id: 'entry-lunch',
  title: 'Lunch',
  startTime: '12:00',
  endTime: '13:30',
})

async function choose(user: User, field: RegExp, option: string) {
  await user.click(screen.getByRole('button', { name: field }))
  const sheet = await screen.findByRole('dialog')
  await user.click(within(sheet).getByRole('radio', { name: option }))
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EntryForm', () => {
  it('reads a cost by the marks it was typed in, across a language switch', async () => {
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () =>
        json({ trip: aTrip({ currency: 'EUR' }), entries: [] }),
      'POST /entries': () =>
        json({ entry: anEntry({ title: 'Museum' }), changeId: 'c1' }, 201),
    })
    const user = userEvent.setup()
    await applyLanguage('vi')
    renderRoute(addPath)

    await user.type(await screen.findByLabelText('Tên hoạt động'), 'Museum')
    await user.type(screen.getByLabelText('Chi phí dự tính'), '12,50')
    await act(() => applyLanguage('en'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Added “Museum”')
    expect(api.requests.find(({ method }) => method === 'POST')?.body).toEqual(
      expect.objectContaining({ costMinor: 1250 }),
    )
  })

  it('starts after the day’s last entry for an hour', async () => {
    fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [lunch] }),
    })
    renderRoute(addPath)

    expect(
      await screen.findByRole('button', { name: 'Starts 14:00' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'How long 1 hr' }),
    ).toBeInTheDocument()
  })

  it('refuses a missing title and keeps what was typed', async () => {
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [] }),
    })
    const user = userEvent.setup()
    renderRoute(addPath)

    await user.type(await screen.findByLabelText('Estimated cost'), '50.000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Enter what it is')).toBeInTheDocument()
    expect(screen.getByLabelText('What is it?')).toHaveFocus()
    expect(screen.getByLabelText('Estimated cost')).toHaveValue('50.000')
    expect(api.requests.some(({ method }) => method === 'POST')).toBe(false)
  })

  it('saves the end its start and length make, past midnight', async () => {
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [] }),
      'POST /entries': () =>
        json({ entry: anEntry({ title: 'Night boat' }), changeId: 'c1' }, 201),
    })
    const user = userEvent.setup()
    renderRoute(addPath)

    await user.type(await screen.findByLabelText('What is it?'), 'Night boat')
    await choose(user, /^Starts/, '23:00')
    await choose(user, /^How long/, '2 hr')
    expect(screen.getByText('Ends at 01:00 the next day')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Added “Night boat”')
    expect(api.requests.find(({ method }) => method === 'POST')?.body).toEqual(
      expect.objectContaining({
        title: 'Night boat',
        startsOn: '2031-05-15',
        startTime: '23:00',
        endsOn: '2031-05-16',
        endTime: '01:00',
      }),
    )
  })

  it('says another person changed it, keeps the typing, and saves on the new version', async () => {
    let saves = 0
    let read = 0
    const api = fakeApi({
      'GET /auth/me': () => json(aUser()),
      'GET /entries/entry-lunch': () =>
        json({ entry: { ...lunch, version: read++ === 0 ? 1 : 2 } }),
      'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [lunch] }),
      'PATCH /entries/entry-lunch': () =>
        saves++ === 0
          ? failure('edit_conflict', 409)
          : json({ entry: { ...lunch, version: 3 }, changeId: 'c2' }),
    })
    const user = userEvent.setup()
    renderRoute('/entries/entry-lunch/edit')

    const title = await screen.findByLabelText('What is it?')
    await user.clear(title)
    await user.type(title, 'Lunch with the family')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(
        'Someone else changed this activity just now. Check it and save again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('What is it?')).toHaveValue(
      'Lunch with the family',
    )
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Saved “Lunch”')

    const versions = api.requests
      .filter(({ method }) => method === 'PATCH')
      .map(({ body }) => (body as { version: number }).version)
    expect(versions).toEqual([1, 2])
  })
})
