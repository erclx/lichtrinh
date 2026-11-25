import '@/i18n/setup'

import type { Change, EntryFields, TripFields } from '@shared/changes.ts'
import i18n from 'i18next'

import { describeChange } from '@/features/changes/describe-change'
import { applyLanguage } from '@/i18n/setup'

const dinner: EntryFields = {
  tripId: 'trip-river',
  title: 'Dinner',
  notes: null,
  kind: 'food',
  startsOn: '2031-05-15',
  startTime: '17:00',
  endsOn: '2031-05-15',
  endTime: '18:30',
  timeZone: 'Asia/Ho_Chi_Minh',
  costMinor: 450_000,
}

const trip: TripFields = {
  name: 'Trip to Sông Mây',
  startsOn: '2031-05-13',
  endsOn: '2031-05-20',
  timeZone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  homeCurrency: 'USD',
}

const base = {
  id: 'change-1',
  at: '2031-05-15T01:00:00.000Z',
  actor: { id: 'user-a', displayName: 'Du khách' },
  source: 'person',
  op: 'update',
  entityId: 'entity-1',
  undoneBy: null,
} as const

function entryChange(
  before: EntryFields | null,
  after: EntryFields | null,
): Change {
  return { ...base, entity: 'entry', before, after }
}

function tripChange(
  before: TripFields | null,
  after: TripFields | null,
): Change {
  return { ...base, entity: 'trip', before, after }
}

function dinnerEdit(fields: Partial<EntryFields>) {
  return entryChange(dinner, { ...dinner, ...fields })
}

function tripEdit(fields: Partial<TripFields>) {
  return tripChange(trip, { ...trip, ...fields })
}

async function sentence(change: Change, language: 'en' | 'vi', money = 'VND') {
  await applyLanguage(language)
  return describeChange(change, money, i18n.t, language)
}

describe('describeChange on an entry', () => {
  it.each([
    ['an add', entryChange(null, dinner), 'Added “Dinner”', 'Thêm “Dinner”'],
    [
      'a removal',
      entryChange(dinner, null),
      'Removed “Dinner”',
      'Xoá “Dinner”',
    ],
    [
      'a rename',
      dinnerEdit({ title: 'Supper' }),
      'Renamed “Dinner” to “Supper”',
      'Đổi tên “Dinner” thành “Supper”',
    ],
    [
      'a move within the day',
      dinnerEdit({ startTime: '17:30', endTime: '19:00' }),
      'Moved “Dinner” 17:00 → 17:30',
      'Dời “Dinner” 17:00 → 17:30',
    ],
    [
      'a move to another day',
      dinnerEdit({ startsOn: '2031-05-16', endsOn: '2031-05-16' }),
      'Moved “Dinner” 17:00 · Thu, May 15 → 17:00 · Fri, May 16',
      'Dời “Dinner” 17:00 · Thứ 5, 15 thg 5 → 17:00 · Thứ 6, 16 thg 5',
    ],
    [
      'a new start alone',
      dinnerEdit({ startTime: '17:30' }),
      'Changed the start of “Dinner” 17:00 → 17:30',
      'Đổi giờ bắt đầu “Dinner” 17:00 → 17:30',
    ],
    [
      'a new end alone',
      dinnerEdit({ endTime: '19:00' }),
      'Changed the end of “Dinner” 18:30 → 19:00',
      'Đổi giờ kết thúc “Dinner” 18:30 → 19:00',
    ],
    [
      'a new kind',
      dinnerEdit({ kind: 'activity' }),
      'Changed the kind of “Dinner” Food → Activity',
      'Đổi loại “Dinner” Ăn uống → Vui chơi',
    ],
    [
      'a cleared kind',
      dinnerEdit({ kind: null }),
      'Changed the kind of “Dinner” Food → no kind',
      'Đổi loại “Dinner” Ăn uống → chưa có',
    ],
    [
      'new notes, left out since they run to a page',
      dinnerEdit({ notes: 'Bring cash' }),
      'Changed the notes of “Dinner”',
      'Đổi ghi chú “Dinner”',
    ],
    [
      'a cleared cost',
      dinnerEdit({ costMinor: null }),
      'Changed the cost of “Dinner” ₫450,000 → no cost',
      'Đổi chi phí “Dinner” 450.000 ₫ → chưa có',
    ],
    [
      'a cost of zero, which is a cost',
      dinnerEdit({ costMinor: 0 }),
      'Changed the cost of “Dinner” ₫450,000 → ₫0',
      'Đổi chi phí “Dinner” 450.000 ₫ → 0 ₫',
    ],
    [
      'several fields at once',
      dinnerEdit({ title: 'Supper', costMinor: 500_000 }),
      'Edited “Supper”',
      'Sửa “Supper”',
    ],
    [
      'a move that also changed the length',
      dinnerEdit({ startTime: '17:30', endTime: '20:00' }),
      'Edited “Dinner”',
      'Sửa “Dinner”',
    ],
    [
      'a save that moved nothing',
      dinnerEdit({}),
      'Edited “Dinner”',
      'Sửa “Dinner”',
    ],
  ])('reads %s', async (_name, change, en, vi) => {
    const read = [await sentence(change, 'en'), await sentence(change, 'vi')]

    expect(read.map((text) => text.replaceAll(' ', ' '))).toEqual([en, vi])
  })

  it('reads a new zone by its name', async () => {
    const change = dinnerEdit({ timeZone: 'Asia/Tokyo' })

    expect(await sentence(change, 'en')).toMatch(
      /^Changed the time zone of “Dinner” [A-Z][a-z]+ Time → Japan/,
    )
  })

  it('reads a cost in the currency it is given', async () => {
    const change = dinnerEdit({ costMinor: 500_050 })

    expect(await sentence(change, 'en', 'USD')).toBe(
      'Changed the cost of “Dinner” $4,500.00 → $5,000.50',
    )
  })
})

describe('describeChange on a trip', () => {
  it.each([
    [
      'a new trip',
      tripChange(null, trip),
      'Created the trip “Trip to Sông Mây”',
      'Tạo chuyến đi “Trip to Sông Mây”',
    ],
    [
      'a removed trip',
      tripChange(trip, null),
      'Removed the trip “Trip to Sông Mây”',
      'Xoá chuyến đi “Trip to Sông Mây”',
    ],
    [
      'a new name',
      tripEdit({ name: 'Sông Mây again' }),
      'Renamed the trip “Trip to Sông Mây” to “Sông Mây again”',
      'Đổi tên chuyến đi “Trip to Sông Mây” thành “Sông Mây again”',
    ],
    [
      'a new currency',
      tripEdit({ currency: 'THB' }),
      'Changed the trip currency VND → THB',
      'Đổi tiền chuyến đi VND → THB',
    ],
    [
      'a new home currency',
      tripEdit({ homeCurrency: 'EUR' }),
      'Changed the home currency USD → EUR',
      'Đổi tiền nhà USD → EUR',
    ],
    [
      'several fields at once',
      tripEdit({ name: 'Sông Mây again', homeCurrency: 'EUR' }),
      'Edited the trip “Sông Mây again”',
      'Sửa chuyến đi “Sông Mây again”',
    ],
  ])('reads %s', async (_name, change, en, vi) => {
    expect([
      await sentence(change, 'en'),
      await sentence(change, 'vi'),
    ]).toEqual([en, vi])
  })

  it('reads both dates as one change of dates', async () => {
    const change = tripEdit({ startsOn: '2031-05-14', endsOn: '2031-05-21' })

    const text = await sentence(change, 'en')

    expect(text.replaceAll(/[  ]/g, ' ')).toBe(
      'Changed the trip dates May 13 – 20, 2031 → May 14 – 21, 2031',
    )
  })

  it('reads a new zone by its name', async () => {
    const change = tripEdit({ timeZone: 'Asia/Tokyo' })

    expect(await sentence(change, 'en')).toMatch(
      /^Changed the trip time zone [A-Z][a-z]+ Time → Japan/,
    )
  })
})
