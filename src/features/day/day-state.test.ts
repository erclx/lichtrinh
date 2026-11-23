import { anEntry } from '@/test/calendar'

import { dayRows } from './day-state'

// 09:30 on 15 May 2031 in Vietnam time, UTC+7.
const halfPastNine = new Date('2031-05-15T02:30:00Z')

describe('dayRows', () => {
  it('marks an entry under way as now, with the minutes it has left', () => {
    const rows = dayRows([anEntry()], '2031-05-15', halfPastNine)

    expect(rows).toEqual([
      expect.objectContaining({ state: 'now', minutesLeft: 30, progress: 0.5 }),
    ])
  })

  it('marks an entry ending at the instant as done', () => {
    const rows = dayRows(
      [anEntry({ startTime: '08:30', endTime: '09:30' })],
      '2031-05-15',
      halfPastNine,
    )

    expect(rows[0].state).toBe('done')
  })

  it('marks an entry starting at the instant as now', () => {
    const rows = dayRows(
      [anEntry({ startTime: '09:30', endTime: '10:00' })],
      '2031-05-15',
      halfPastNine,
    )

    expect(rows[0].state).toBe('now')
  })

  it('marks a later entry as upcoming', () => {
    const rows = dayRows(
      [anEntry({ startTime: '12:00', endTime: '13:00' })],
      '2031-05-15',
      halfPastNine,
    )

    expect(rows[0]).toEqual(
      expect.objectContaining({ state: 'upcoming', minutesLeft: null }),
    )
  })

  it('orders overlapping entries by start and marks both now', () => {
    const later = anEntry({ id: 'b', startTime: '09:15', endTime: '11:00' })
    const earlier = anEntry({ id: 'a', startTime: '09:00', endTime: '10:00' })

    const rows = dayRows([later, earlier], '2031-05-15', halfPastNine)

    expect(rows.map((row) => [row.entry.id, row.state])).toEqual([
      ['a', 'now'],
      ['b', 'now'],
    ])
  })

  it('keeps an entry crossing midnight now until its end the next day', () => {
    const boat = anEntry({
      startsOn: '2031-05-14',
      startTime: '23:00',
      endsOn: '2031-05-15',
      endTime: '00:30',
    })
    // 00:15 on 15 May in Vietnam time.
    const quarterPastMidnight = new Date('2031-05-14T17:15:00Z')

    const rows = dayRows([boat], '2031-05-14', quarterPastMidnight)

    expect(rows[0]).toEqual(
      expect.objectContaining({ state: 'now', minutesLeft: 15 }),
    )
  })

  it('marks every entry on a past day as done', () => {
    const rows = dayRows(
      [anEntry({ startsOn: '2031-05-14', endsOn: '2031-05-14' })],
      '2031-05-14',
      halfPastNine,
    )

    expect(rows[0].state).toBe('done')
  })

  it('leaves out entries starting on another day', () => {
    const rows = dayRows(
      [anEntry({ startsOn: '2031-05-16', endsOn: '2031-05-16' })],
      '2031-05-15',
      halfPastNine,
    )

    expect(rows).toEqual([])
  })

  it('reads the clock in the entry’s zone, never the device’s', () => {
    // 09:30 in Vietnam is 04:30 in Paris, still before a Paris entry at 09:00.
    const paris = anEntry({ timeZone: 'Europe/Paris' })

    const rows = dayRows([paris], '2031-05-15', halfPastNine)

    expect(rows[0].state).toBe('upcoming')
  })
})
