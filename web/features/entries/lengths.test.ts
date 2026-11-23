import { endFor, lengthOptions, startTimes } from './lengths'

describe('startTimes', () => {
  it('offers every half hour of the day from midnight', () => {
    expect(startTimes.slice(0, 3)).toEqual(['00:00', '00:30', '01:00'])
    expect(startTimes).toHaveLength(48)
    expect(startTimes.at(-1)).toBe('23:30')
  })
})

describe('endFor', () => {
  it('ends on the same day when the length fits before midnight', () => {
    expect(endFor('15:00', 90)).toEqual({ time: '16:30', daysLater: 0 })
  })

  it('ends at midnight on the next day', () => {
    expect(endFor('23:00', 60)).toEqual({ time: '00:00', daysLater: 1 })
  })

  it('runs past midnight into the next day', () => {
    expect(endFor('23:30', 180)).toEqual({ time: '02:30', daysLater: 1 })
  })
})

describe('lengthOptions', () => {
  it('offers the six lengths when the entry has one of them', () => {
    expect(lengthOptions(60)).toEqual([15, 30, 60, 90, 120, 180])
  })

  it('offers the six lengths for a new entry', () => {
    expect(lengthOptions()).toEqual([15, 30, 60, 90, 120, 180])
  })

  it('adds an entry length that is none of the six in order', () => {
    expect(lengthOptions(150)).toEqual([15, 30, 60, 90, 120, 150, 180])
  })

  it('adds an entry length longer than any of the six at the end', () => {
    expect(lengthOptions(300)).toEqual([15, 30, 60, 90, 120, 180, 300])
  })
})
