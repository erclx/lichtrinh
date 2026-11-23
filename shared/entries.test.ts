import { describe, expect, it } from 'vitest'

import { firstFreeHour } from './entries.ts'

function span(startTime: string, endTime: string, endsOn = '2031-04-10') {
  return { startsOn: '2031-04-10', startTime, endsOn, endTime }
}

describe('firstFreeHour', () => {
  it('opens an empty day at 09:00', () => {
    expect(firstFreeHour([])).toBe('09:00')
  })

  it('takes the hour an entry ends on the hour', () => {
    expect(firstFreeHour([span('09:00', '11:00')])).toBe('11:00')
  })

  it('rounds a part-hour end up to the next hour', () => {
    expect(firstFreeHour([span('09:00', '10:30')])).toBe('11:00')
  })

  it('follows the entry ending last, not the one listed last', () => {
    const day = [span('08:00', '15:10'), span('12:00', '13:00')]

    expect(firstFreeHour(day)).toBe('16:00')
  })

  it('stops at 23:00 when the day runs out of hours', () => {
    expect(firstFreeHour([span('20:00', '23:20')])).toBe('23:00')
  })

  it('stops at 23:00 when the last entry runs past midnight', () => {
    expect(firstFreeHour([span('22:00', '01:00', '2031-04-11')])).toBe('23:00')
  })
})
