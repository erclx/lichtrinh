import {
  convertClock,
  isTimeZone,
  minutesBetween,
  nowInZone,
  shiftClock,
} from './trip-time.ts'

// New York's 2031 changes: clocks jump from 02:00 to 03:00 on 9 March and
// fall back from 02:00 to 01:00 on 2 November.
const NEW_YORK = 'America/New_York'

describe('nowInZone', () => {
  it('gives the local date and minute in the trip zone', () => {
    const at = new Date('2031-03-15T03:30:00Z')

    expect(nowInZone(at, 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2031-03-15',
      minute: 10 * 60 + 30,
    })
  })

  it('moves to the next date when the zone has passed midnight', () => {
    const at = new Date('2031-03-15T20:00:00Z')

    expect(nowInZone(at, 'Asia/Tokyo')).toEqual({
      date: '2031-03-16',
      minute: 5 * 60,
    })
  })

  it('reads local midnight as minute zero', () => {
    const at = new Date('2031-03-15T17:00:00Z')

    expect(nowInZone(at, 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2031-03-16',
      minute: 0,
    })
  })
})

describe('isTimeZone', () => {
  it.each(['Asia/Ho_Chi_Minh', 'Europe/Paris', NEW_YORK, 'UTC'])(
    'accepts %s',
    (name) => {
      expect(isTimeZone(name)).toBe(true)
    },
  )

  it.each(['Mars/Olympus_Mons', '', 'GMT+7 please'])('refuses %j', (name) => {
    expect(isTimeZone(name)).toBe(false)
  })
})

describe('convertClock', () => {
  it('moves a clock time between two fixed zones', () => {
    const moved = convertClock(
      { date: '2031-07-01', time: '09:00' },
      'Asia/Ho_Chi_Minh',
      'Asia/Tokyo',
    )

    expect(moved).toEqual({ date: '2031-07-01', time: '11:00' })
  })

  it('moves the date back when the target zone is still on the day before', () => {
    const moved = convertClock(
      { date: '2031-07-01', time: '01:00' },
      'Asia/Tokyo',
      'Asia/Ho_Chi_Minh',
    )

    expect(moved).toEqual({ date: '2031-06-30', time: '23:00' })
  })

  it('reads a summer clock time at the daylight offset', () => {
    const moved = convertClock(
      { date: '2031-07-01', time: '09:00' },
      NEW_YORK,
      'UTC',
    )

    expect(moved).toEqual({ date: '2031-07-01', time: '13:00' })
  })

  it('reads a winter clock time at the standard offset', () => {
    const moved = convertClock(
      { date: '2031-03-09', time: '01:30' },
      NEW_YORK,
      'UTC',
    )

    expect(moved).toEqual({ date: '2031-03-09', time: '06:30' })
  })

  it('moves a clock time inside the spring gap forward by the gap', () => {
    const moved = convertClock(
      { date: '2031-03-09', time: '02:30' },
      NEW_YORK,
      'UTC',
    )

    expect(moved).toEqual({ date: '2031-03-09', time: '07:30' })
  })

  it('reads a clock time inside the autumn overlap as the earlier one', () => {
    const moved = convertClock(
      { date: '2031-11-02', time: '01:30' },
      NEW_YORK,
      'UTC',
    )

    expect(moved).toEqual({ date: '2031-11-02', time: '05:30' })
  })

  it('lands on the daylight clock time just after the spring change', () => {
    const moved = convertClock(
      { date: '2031-03-09', time: '07:30' },
      'UTC',
      NEW_YORK,
    )

    expect(moved).toEqual({ date: '2031-03-09', time: '03:30' })
  })

  it('keeps the clock time when both zones are the same', () => {
    const moved = convertClock(
      { date: '2031-11-02', time: '01:30' },
      NEW_YORK,
      NEW_YORK,
    )

    expect(moved).toEqual({ date: '2031-11-02', time: '01:30' })
  })
})

describe('shiftClock', () => {
  it('moves a wall clock forward within the day', () => {
    expect(shiftClock({ date: '2031-04-10', time: '09:15' }, 90)).toEqual({
      date: '2031-04-10',
      time: '10:45',
    })
  })

  it('rolls past midnight into the next date', () => {
    expect(shiftClock({ date: '2031-04-30', time: '23:30' }, 60)).toEqual({
      date: '2031-05-01',
      time: '00:30',
    })
  })

  it('reads the wall clock alone, ignoring a zone shift that night', () => {
    expect(shiftClock({ date: '2031-03-09', time: '01:30' }, 60)).toEqual({
      date: '2031-03-09',
      time: '02:30',
    })
  })
})

describe('minutesBetween', () => {
  it('counts the wall clock minutes from one clock to a later one', () => {
    const from = { date: '2031-04-10', time: '22:00' }
    const to = { date: '2031-04-11', time: '01:15' }

    expect(minutesBetween(from, to)).toBe(195)
  })
})
