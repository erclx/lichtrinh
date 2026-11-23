import { aTrip } from '@/test/calendar'

import { pickToday } from './pick-today'

describe('pickToday', () => {
  it('picks the trip under way on its own date, where UTC is still the day before', () => {
    // 20:00 UTC on 12 May is 03:00 on 13 May in Vietnam time.
    const at = new Date('2031-05-12T20:00:00Z')
    const trip = aTrip({ startsOn: '2031-05-13', endsOn: '2031-05-20' })

    expect(pickToday([trip], at)).toEqual({
      kind: 'under-way',
      trip,
      date: '2031-05-13',
    })
  })

  it('counts a trip’s last day as under way', () => {
    const at = new Date('2031-05-20T10:00:00Z')
    const trip = aTrip()

    expect(pickToday([trip], at)).toEqual(
      expect.objectContaining({ kind: 'under-way', date: '2031-05-20' }),
    )
  })

  it('picks the soonest trip still to come when none is under way', () => {
    const at = new Date('2031-04-01T10:00:00Z')
    const later = aTrip({ id: 'later', startsOn: '2031-07-02' })
    const sooner = aTrip({ id: 'sooner', startsOn: '2031-05-13' })

    expect(pickToday([later, sooner], at)).toEqual({
      kind: 'next',
      trip: sooner,
    })
  })

  it('finds nothing when every trip is over', () => {
    const at = new Date('2031-06-01T10:00:00Z')

    expect(pickToday([aTrip()], at)).toEqual({ kind: 'none' })
  })

  it('finds nothing with no trips at all', () => {
    expect(pickToday([], new Date('2031-05-15T02:00:00Z'))).toEqual({
      kind: 'none',
    })
  })
})
