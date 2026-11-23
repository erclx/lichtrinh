import { aTrip } from '@/test/calendar'

import {
  monthWeeks,
  shiftMonth,
  tripsOn,
  weekDays,
  weekGroups,
} from './calendar-range'

const river = aTrip({
  id: 'trip-river',
  startsOn: '2031-05-13',
  endsOn: '2031-05-20',
})
const island = aTrip({
  id: 'trip-island',
  name: 'Trip to Đảo Lam',
  startsOn: '2031-05-20',
  endsOn: '2031-05-24',
})

describe('monthWeeks', () => {
  it('opens a month starting on Sunday on the Monday six days before', () => {
    const weeks = monthWeeks('2031-06-01', [])

    expect(weeks[0][0]).toMatchObject({ date: '2031-05-26', inMonth: false })
    expect(weeks[0][6]).toMatchObject({ date: '2031-06-01', inMonth: true })
  })

  it('holds all 31 days of a 31-day month in month order', () => {
    const weeks = monthWeeks('2031-05-10', [])

    const inMonth = weeks.flat().filter((day) => day.inMonth)

    expect(inMonth).toHaveLength(31)
    expect(inMonth[0].date).toBe('2031-05-01')
    expect(inMonth[30].date).toBe('2031-05-31')
  })

  it('marks each day of a trip with the trip, flagging its first and last day', () => {
    const weeks = monthWeeks('2031-05-01', [river])

    const days = weeks.flat()
    const first = days.find((day) => day.date === '2031-05-13')
    const middle = days.find((day) => day.date === '2031-05-16')
    const outside = days.find((day) => day.date === '2031-05-12')

    expect(first?.trips).toEqual([{ trip: river, starts: true, ends: false }])
    expect(middle?.trips).toEqual([{ trip: river, starts: false, ends: false }])
    expect(outside?.trips).toEqual([])
  })
})

describe('weekDays', () => {
  it('runs a week across two months from its Monday', () => {
    const days = weekDays('2031-06-01', [])

    expect(days.map((day) => day.date)).toEqual([
      '2031-05-26',
      '2031-05-27',
      '2031-05-28',
      '2031-05-29',
      '2031-05-30',
      '2031-05-31',
      '2031-06-01',
    ])
  })
})

describe('tripsOn', () => {
  it('splits a date two trips share, the ending trip first', () => {
    const trips = tripsOn('2031-05-20', [island, river])

    expect(trips).toEqual([
      { trip: river, starts: false, ends: true },
      { trip: island, starts: true, ends: false },
    ])
  })
})

describe('weekGroups', () => {
  it('groups a week into runs of free days and of each trip', () => {
    const groups = weekGroups(weekDays('2031-05-12', [river]))

    expect(
      groups.map((group) => [group.trip?.id ?? null, group.days.length]),
    ).toEqual([
      [null, 1],
      ['trip-river', 6],
    ])
  })

  it('puts a date two trips share in the trip starting on it', () => {
    const groups = weekGroups(weekDays('2031-05-19', [river, island]))

    expect(
      groups.map((group) => [group.trip?.id ?? null, group.days[0].date]),
    ).toEqual([
      ['trip-river', '2031-05-19'],
      ['trip-island', '2031-05-20'],
      [null, '2031-05-25'],
    ])
  })
})

describe('shiftMonth', () => {
  it('moves to the first of the month before or after, across a year', () => {
    expect(shiftMonth('2031-12-31', 1)).toBe('2032-01-01')
    expect(shiftMonth('2031-01-15', -1)).toBe('2030-12-01')
  })
})
