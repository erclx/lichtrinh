import { QueryClient } from '@tanstack/react-query'
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client'

import { calendarKeys } from '@/calendar-data/queries'
import {
  calendarCacheKey,
  calendarCacheMaxAge,
  calendarPersistOptions,
  clearCalendarCache,
} from '@/offline/persist'

const tripsKey = calendarKeys.trips()
const savedTrips = [{ id: 'trip-river', name: 'Sông Mây 2031' }]

async function saveAPlan() {
  const client = new QueryClient()
  client.setQueryData(tripsKey, savedTrips)
  await persistQueryClientSave({
    queryClient: client,
    ...calendarPersistOptions(),
  })
  return client
}

async function restoreAPlan() {
  const client = new QueryClient()
  await persistQueryClientRestore({
    queryClient: client,
    ...calendarPersistOptions(),
  })
  return client.getQueryData(tripsKey)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the saved plan', () => {
  it('opens again within a week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2031-05-15T02:45:00Z'))
    await saveAPlan()

    vi.setSystemTime(Date.now() + calendarCacheMaxAge - 60_000)

    expect(await restoreAPlan()).toEqual(savedTrips)
  })

  it('is dropped once it is older than a week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2031-05-15T02:45:00Z'))
    await saveAPlan()

    vi.setSystemTime(Date.now() + calendarCacheMaxAge + 60_000)

    expect(await restoreAPlan()).toBeUndefined()
  })

  it('is dropped when another app version saved it', async () => {
    await saveAPlan()
    const stored = JSON.parse(localStorage.getItem(calendarCacheKey) ?? '{}')
    localStorage.setItem(
      calendarCacheKey,
      JSON.stringify({ ...stored, buster: 'an older version' }),
    )

    expect(await restoreAPlan()).toBeUndefined()
  })

  it('keeps calendar reads alone', async () => {
    const client = new QueryClient()
    client.setQueryData(tripsKey, savedTrips)
    client.setQueryData(['chats'], [{ id: 'chat-1' }])

    await persistQueryClientSave({
      queryClient: client,
      ...calendarPersistOptions(),
    })

    const stored = localStorage.getItem(calendarCacheKey) ?? ''
    expect(stored).toContain('trip-river')
    expect(stored).not.toContain('chat-1')
  })

  it('is forgotten on the device and in memory at sign-out', async () => {
    const client = await saveAPlan()

    clearCalendarCache(client)

    expect(client.getQueryData(tripsKey)).toBeUndefined()
    expect(localStorage.getItem(calendarCacheKey)).toBeNull()
    expect(await restoreAPlan()).toBeUndefined()
  })
})
