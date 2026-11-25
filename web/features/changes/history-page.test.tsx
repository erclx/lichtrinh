import '@/i18n/setup'

import type { Change, EntryFields, TripFields } from '@shared/changes.ts'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyLanguage } from '@/i18n/setup'
import { aTrip } from '@/test/calendar'
import { aMoveChange, anAddChange } from '@/test/chat'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'
import { renderRoute } from '@/test/render-route'

const historyPath = '/trips/trip-river/history'
const changesRoute = 'GET /trips/trip-river/changes'

type Routes = Parameters<typeof fakeApi>[0]

function serve(changes: Change[], routes: Routes = {}) {
  return fakeApi({
    'GET /auth/me': () => json(aUser()),
    'GET /trips/trip-river': () => json({ trip: aTrip(), entries: [] }),
    [changesRoute]: () => json({ changes, nextBefore: null }),
    ...routes,
  })
}

const market: EntryFields = {
  tripId: 'trip-river',
  title: 'Flower market',
  notes: null,
  kind: 'sights',
  startsOn: '2031-05-15',
  startTime: '09:00',
  endsOn: '2031-05-15',
  endTime: '10:00',
  timeZone: 'Asia/Ho_Chi_Minh',
  costMinor: null,
}

/** A person adding an invented market visit, 08:12 in the trip's zone. */
function aPersonAdd(
  overrides: Partial<Extract<Change, { entity: 'entry' }>> = {},
) {
  return anAddChange({
    id: 'change-market',
    at: '2031-05-15T01:12:00.000Z',
    actor: { id: 'user-family', displayName: 'bà ngoại' },
    source: 'person',
    entityId: 'entry-market',
    after: market,
    ...overrides,
  })
}

const tripFields: TripFields = {
  name: 'Trip to Sông Mây',
  startsOn: '2031-05-13',
  endsOn: '2031-05-20',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  homeCurrency: 'USD',
}

function aTripChange(
  before: TripFields | null,
  after: TripFields | null,
): Change {
  return {
    id: 'change-trip',
    at: '2031-05-14T01:00:00.000Z',
    actor: { id: 'user-family', displayName: 'bà ngoại' },
    source: 'person',
    op: 'update',
    entity: 'trip',
    entityId: 'trip-river',
    undoneBy: null,
    before,
    after,
  }
}

async function rowOf(text: string | RegExp) {
  const row = (await screen.findByText(text)).closest('li')
  if (row === null) throw new Error('The sentence sits outside a row')
  return row
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HistoryPage', () => {
  it('lists each change newest first under its day in trip time', async () => {
    serve([
      // 00:10 on the 16th in the trip's zone, still the 15th in UTC.
      aMoveChange({ at: '2031-05-15T17:10:00.000Z' }),
      // 23:50 on the 15th in the trip's zone.
      aPersonAdd({ at: '2031-05-15T16:50:00.000Z' }),
    ])

    renderRoute(historyPath)

    const days = await screen.findAllByRole('heading', { level: 2 })
    expect(days.map((day) => day.textContent)).toEqual([
      'Friday, May 16',
      'Thursday, May 15',
    ])
    expect(
      screen.getAllByRole('listitem').map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining('Moved “Sunset boat trip” 17:00 → 17:30 · 00:10'),
      expect.stringContaining('Added “Flower market” · 23:50'),
    ])
  })

  it('calls the trip’s current day Today', async () => {
    vi.useFakeTimers({
      now: new Date('2031-05-15T17:30:00Z'),
      toFake: ['Date'],
    })
    serve([aMoveChange({ at: '2031-05-15T17:10:00.000Z' })])

    renderRoute(historyPath)

    expect(
      await screen.findByRole('heading', { name: 'Today' }),
    ).toBeInTheDocument()
  })

  it('names the assistant and the person it acted for', async () => {
    serve([aMoveChange()])

    renderRoute(historyPath)

    const row = await rowOf(/^Moved/)
    expect(within(row).getByText('Assistant')).toBeInTheDocument()
    expect(row).toHaveTextContent('for Du khách')
  })

  it('names the person who made a change by hand beside their initial', async () => {
    serve([aPersonAdd()])

    renderRoute(historyPath)

    const row = await rowOf(/^Added/)
    expect(within(row).getByText('bà ngoại')).toBeInTheDocument()
    expect(within(row).getByText('B')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('Assistant')
    expect(row).not.toHaveTextContent('for bà ngoại')
  })

  it('reads an undo by what it did, tagged as an undo', async () => {
    serve([aPersonAdd({ op: 'undo' })])

    renderRoute(historyPath)

    const row = await rowOf(/^Added “Flower market”/)
    expect(within(row).getByText('Undo', { selector: 'span' })).toBeVisible()
  })

  it('reads an older cost in the currency the trip was in then', async () => {
    serve([
      aTripChange({ ...tripFields, currency: 'THB' }, tripFields),
      aPersonAdd({
        op: 'update',
        before: { ...market, costMinor: 10_000 },
        after: null,
      }),
      aPersonAdd({
        id: 'change-cost',
        op: 'update',
        before: { ...market, costMinor: null },
        after: { ...market, costMinor: 10_000 },
      }),
    ])

    renderRoute(historyPath)

    const row = await rowOf(/^Changed the cost/)
    expect(row.textContent.replaceAll(' ', ' ')).toContain(
      'no cost → THB 100.00',
    )
  })

  it('says a trip nobody changed has no changes yet', async () => {
    serve([])

    renderRoute(historyPath)

    expect(
      await screen.findByRole('heading', { name: 'No changes yet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the trip' })).toHaveAttribute(
      'href',
      '/trips/trip-river',
    )
  })

  it('reads in Vietnamese', async () => {
    await applyLanguage('vi')
    serve([aMoveChange()])

    renderRoute(historyPath)

    expect(
      await screen.findByRole('heading', { name: 'Lịch sử thay đổi' }),
    ).toBeInTheDocument()
    const row = await rowOf(/^Dời “Sunset boat trip” 17:00 → 17:30/)
    expect(within(row).getByText('Trợ lý')).toBeInTheDocument()
    expect(row).toHaveTextContent('giúp Du khách')
  })
})

describe('HistoryPage paging', () => {
  it('appends the next page and drops the button at the end', async () => {
    const user = userEvent.setup()
    serve([], {
      [changesRoute]: () =>
        json({ changes: [aMoveChange()], nextBefore: 'change-move' }),
      [`${changesRoute}?before=change-move`]: () =>
        json({ changes: [aPersonAdd()], nextBefore: null }),
    })
    renderRoute(historyPath)

    await user.click(
      await screen.findByRole('button', { name: 'Show older changes' }),
    )

    expect(await screen.findByText(/^Added “Flower market”/)).toBeVisible()
    expect(screen.getByText(/^Moved/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Show older changes' }),
    ).toBeNull()
  })

  it('keeps what is on screen when the next page fails, and asks again', async () => {
    const user = userEvent.setup()
    let calls = 0
    serve([], {
      [changesRoute]: () =>
        json({ changes: [aMoveChange()], nextBefore: 'change-move' }),
      [`${changesRoute}?before=change-move`]: () => {
        calls += 1
        return calls === 1
          ? failure('internal_error', 500)
          : json({ changes: [aPersonAdd()], nextBefore: null })
      },
    })
    renderRoute(historyPath)
    const older = await screen.findByRole('button', {
      name: 'Show older changes',
    })

    await user.click(older)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load older changes.",
    )
    expect(screen.getByText(/^Moved/)).toBeVisible()
    await user.click(older)

    expect(await screen.findByText(/^Added “Flower market”/)).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('HistoryPage undo', () => {
  const undoMarket = 'POST /changes/change-market/undo'

  it('reads Undone in place, with the undo on top carrying its own Undo', async () => {
    const user = userEvent.setup()
    const undo = aPersonAdd({
      id: 'change-undo',
      op: 'undo',
      before: market,
      after: null,
    })
    let undone = false
    serve([], {
      [changesRoute]: () =>
        json({
          changes: undone
            ? [undo, aPersonAdd({ undoneBy: 'change-undo' })]
            : [aPersonAdd()],
          nextBefore: null,
        }),
      [undoMarket]: () => {
        undone = true
        return json({ change: undo })
      },
    })
    renderRoute(historyPath)

    await user.click(
      await screen.findByRole('button', {
        name: 'Undo: Added “Flower market”',
      }),
    )

    const top = await rowOf(/^Removed “Flower market”/)
    expect(
      within(top).getByRole('button', {
        name: 'Undo: Removed “Flower market”',
      }),
    ).toBeVisible()
    const row = await rowOf(/^Added “Flower market”/)
    expect(within(row).getByText('Undone')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('shows Undone and no Undo for a change undone before', async () => {
    serve([aPersonAdd({ undoneBy: 'change-undo' })])

    renderRoute(historyPath)

    const row = await rowOf(/^Added/)
    expect(within(row).getByText('Undone')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('says under the row that a later change holds, and keeps Undo', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], {
      [undoMarket]: () => failure('undo_conflict', 409),
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)

    await user.click(within(row).getByRole('button'))

    expect(await within(row).findByRole('status')).toHaveTextContent(
      "Can't undo, since someone changed it after.",
    )
    expect(within(row).getByRole('button')).toBeVisible()
  })

  it('says a change undone elsewhere was already undone', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], {
      [undoMarket]: () => failure('already_undone', 409),
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)

    await user.click(within(row).getByRole('button'))

    expect(
      await within(row).findByText('That was already undone.'),
    ).toBeVisible()
    expect(within(row).getByText('Undone')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('offers Undo again after a lost answer', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], { [undoMarket]: offline })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)

    await user.click(within(row).getByRole('button'))

    expect(await within(row).findByText(/Can't connect/)).toBeVisible()
    expect(within(row).getByRole('button')).toBeVisible()
  })

  it('moves focus to the row when its Undo goes away under the keyboard', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], {
      [undoMarket]: () => json({ change: aPersonAdd({ id: 'change-undo' }) }),
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)
    within(row).getByRole('button').focus()

    await user.keyboard('{Enter}')

    await within(row).findByText('Undone')
    expect(row).toHaveFocus()
  })

  it('moves focus to the row when a keyboard undo was already undone', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], {
      [undoMarket]: () => failure('already_undone', 409),
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)
    within(row).getByRole('button').focus()

    await user.keyboard('{Enter}')

    await within(row).findByText('That was already undone.')
    expect(row).toHaveFocus()
  })

  it('leaves focus alone when a refusal keeps the button', async () => {
    const user = userEvent.setup()
    serve([aPersonAdd()], {
      [undoMarket]: () => failure('undo_conflict', 409),
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)
    within(row).getByRole('button').focus()

    await user.keyboard('{Enter}')

    await within(row).findByText(/someone changed it after/)
    expect(within(row).getByRole('button')).toHaveFocus()
  })

  it('clears the refusal once the later change is undone', async () => {
    const user = userEvent.setup()
    const moved = { ...market, startTime: '09:30', endTime: '10:30' }
    const move = aPersonAdd({
      id: 'change-move',
      op: 'update',
      before: market,
      after: moved,
    })
    const undo = aPersonAdd({
      id: 'change-undo',
      op: 'undo',
      before: moved,
      after: market,
    })
    let undone = false
    serve([], {
      [changesRoute]: () =>
        json({
          changes: undone
            ? [undo, { ...move, undoneBy: 'change-undo' }, aPersonAdd()]
            : [move, aPersonAdd()],
          nextBefore: null,
        }),
      [undoMarket]: () => failure('undo_conflict', 409),
      'POST /changes/change-move/undo': () => {
        undone = true
        return json({ change: undo })
      },
    })
    renderRoute(historyPath)
    const added = await rowOf(/^Added/)
    await user.click(within(added).getByRole('button'))
    await within(added).findByText(/someone changed it after/)

    const movedRow = await rowOf(/^Moved “Flower market” 09:00 → 09:30/)
    await user.click(within(movedRow).getByRole('button'))

    await screen.findByText(/^Moved “Flower market” 09:30 → 09:00/)
    expect(within(added).queryByText(/someone changed it after/)).toBeNull()
    expect(within(added).getByRole('button')).toBeVisible()
  })

  it.each([
    ['entries_outside_range', /outside the trip's dates/],
    ['currency_has_costs', /another currency/],
  ] as const)('says plainly why %s refuses', async (code, text) => {
    const user = userEvent.setup()
    serve([aPersonAdd()], { [undoMarket]: () => failure(code, 409) })
    renderRoute(historyPath)
    const row = await rowOf(/^Added/)

    await user.click(within(row).getByRole('button'))

    expect(await within(row).findByText(text)).toBeVisible()
  })

  it('offers the way back when an undo removes the trip itself', async () => {
    const user = userEvent.setup()
    const removal = { ...aTripChange(tripFields, null), id: 'change-undo' }
    let removed = false
    const { requests } = serve([], {
      'GET /trips/trip-river': () =>
        removed
          ? failure('not_found', 404)
          : json({ trip: aTrip(), entries: [] }),
      [changesRoute]: () =>
        removed
          ? failure('not_found', 404)
          : json({
              changes: [aTripChange(null, tripFields)],
              nextBefore: null,
            }),
      'POST /changes/change-trip/undo': () => {
        removed = true
        return json({ change: { ...removal, op: 'undo' } })
      },
      'POST /changes/change-undo/undo': () => {
        removed = false
        return json({ change: aTripChange(null, tripFields) })
      },
    })
    renderRoute(historyPath)
    const row = await rowOf(/^Created the trip/)

    await user.click(within(row).getByRole('button'))
    await screen.findByText(/This trip isn't here/)
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() =>
      expect(requests.map(({ path }) => path)).toContain(
        '/changes/change-undo/undo',
      ),
    )
  })
})

describe('HistoryPage without its trip', () => {
  it('says a missing trip is not here', async () => {
    fakeApi({ 'GET /auth/me': () => json(aUser()) })

    renderRoute(historyPath)

    expect(await screen.findByText(/This trip isn't here/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'All trips' })).toBeVisible()
  })

  it('offers a retry when the changes fail to load', async () => {
    const user = userEvent.setup()
    let calls = 0
    serve([], {
      [changesRoute]: () => {
        calls += 1
        return calls === 1
          ? failure('internal_error', 500)
          : json({ changes: [aPersonAdd()], nextBefore: null })
      },
    })
    renderRoute(historyPath)

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/^Added/)).toBeVisible()
  })
})

describe('the trip overview', () => {
  it('links the change history beside the budget', async () => {
    serve([])

    renderRoute('/trips/trip-river')

    expect(
      await screen.findByRole('link', { name: 'Change history' }),
    ).toHaveAttribute('href', historyPath)
    expect(screen.getByRole('link', { name: 'Budget' })).toBeInTheDocument()
  })
})
