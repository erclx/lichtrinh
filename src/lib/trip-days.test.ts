import { datesBetween, daysIn, daysUntil } from './trip-days'

describe('datesBetween', () => {
  it('lists every day across a month end, both ends included', () => {
    expect(datesBetween('2031-05-30', '2031-06-02')).toEqual([
      '2031-05-30',
      '2031-05-31',
      '2031-06-01',
      '2031-06-02',
    ])
  })

  it('lists one day for a one-day span', () => {
    expect(datesBetween('2031-05-13', '2031-05-13')).toEqual(['2031-05-13'])
  })
})

describe('daysIn', () => {
  it('counts both ends', () => {
    expect(daysIn('2031-05-13', '2031-05-20')).toBe(8)
  })
})

describe('daysUntil', () => {
  it('counts whole days ahead and behind', () => {
    expect(daysUntil('2031-05-15', '2031-07-02')).toBe(48)
    expect(daysUntil('2031-05-15', '2031-05-13')).toBe(-2)
  })
})
