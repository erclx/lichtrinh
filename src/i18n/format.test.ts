import {
  formatMonthTitle,
  formatNumericDate,
  formatShortDate,
  weekdayLabels,
} from './format'

describe('formatMonthTitle', () => {
  it.each([
    ['vi', 'Tháng 9 năm 2031'],
    ['en', 'September 2031'],
  ] as const)('names the month and year in %s', (language, title) => {
    expect(formatMonthTitle(2031, 9, language)).toBe(title)
  })
})

describe('weekdayLabels', () => {
  it.each([
    ['vi', ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']],
    ['en', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
  ] as const)('runs Monday to Sunday in %s', (language, labels) => {
    expect(weekdayLabels(language)).toEqual(labels)
  })
})

describe('formatShortDate', () => {
  it.each([
    ['vi', '20/9'],
    ['en', '9/20'],
  ] as const)('gives the day and month in %s', (language, date) => {
    expect(formatShortDate('2031-09-20', language)).toBe(date)
  })
})

describe('formatNumericDate', () => {
  it.each([
    ['vi', '20/9/2031'],
    ['en', '9/20/2031'],
  ] as const)('gives the day, month, and year in %s', (language, date) => {
    expect(formatNumericDate('2031-09-20', language)).toBe(date)
  })
})
