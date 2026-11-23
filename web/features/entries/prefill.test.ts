import { anEntry } from '@/test/calendar'

import { prefillFor } from './prefill'

describe('prefillFor', () => {
  it('starts an empty day at 09:00 for an hour', () => {
    expect(prefillFor([])).toEqual({ startTime: '09:00', minutes: 60 })
  })

  it('starts on the hour the last entry ends on', () => {
    const entries = [anEntry({ startTime: '13:00', endTime: '15:00' })]

    expect(prefillFor(entries)).toEqual({ startTime: '15:00', minutes: 60 })
  })

  it('rounds a last end between hours up to the next hour', () => {
    const entries = [
      anEntry({ id: 'a', startTime: '09:00', endTime: '14:30' }),
      anEntry({ id: 'b', startTime: '10:00', endTime: '11:00' }),
    ]

    expect(prefillFor(entries).startTime).toBe('15:00')
  })

  it('starts at 23:00 when the day is full to midnight', () => {
    const entries = [
      anEntry({ startTime: '22:00', endsOn: '2031-05-16', endTime: '01:00' }),
    ]

    expect(prefillFor(entries).startTime).toBe('23:00')
  })
})
