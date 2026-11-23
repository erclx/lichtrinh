import {
  formatDateSpan,
  formatDuration,
  formatLongDate,
  formatMoney,
  formatMonthTitle,
  formatNumericDate,
  formatShortDate,
  formatTime,
  formatWeekday,
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

describe('formatTime', () => {
  it.each([
    ['vi', '09:05'],
    ['en', '09:05'],
  ] as const)('gives a 24-hour clock in %s', (language, time) => {
    expect(formatTime('09:05', language)).toBe(time)
  })
})

describe('formatDuration', () => {
  it.each([
    ['vi', 75, '1 giờ 15 phút'],
    ['en', 75, '1 hr 15 min'],
    ['vi', 120, '2 giờ'],
    ['en', 15, '15 min'],
  ] as const)(
    'gives the hours and minutes in %s',
    (language, minutes, text) => {
      expect(formatDuration(minutes, language)).toBe(text)
    },
  )

  it('names a length of nothing in minutes', () => {
    expect(formatDuration(0, 'en')).toBe('0 min')
  })
})

describe('formatMoney', () => {
  it.each([
    // Intl keeps the amount and its sign together with a no-break space.
    ['vi', 200_000, 'VND', '200.000 ₫'],
    ['en', 200_000, 'VND', '₫200,000'],
    ['vi', 850, 'USD', '8,50 US$'],
    ['en', 850, 'USD', '$8.50'],
  ] as const)(
    'reads minor units by the currency’s own digits in %s',
    (language, minor, currency, text) => {
      expect(formatMoney(minor, currency, language)).toBe(text)
    },
  )
})

describe('formatLongDate', () => {
  it.each([
    ['vi', 'Thứ Năm, 15 tháng 5'],
    ['en', 'Thursday, May 15'],
  ] as const)('names the weekday, day, and month in %s', (language, text) => {
    expect(formatLongDate('2031-05-15', language)).toBe(text)
  })
})

describe('formatWeekday', () => {
  it.each([
    ['vi', 'Thứ 5'],
    ['en', 'Thu'],
  ] as const)('gives the short weekday in %s', (language, text) => {
    expect(formatWeekday('2031-05-15', language)).toBe(text)
  })
})

describe('formatDateSpan', () => {
  it.each([
    // Intl sets thin spaces around the range dash.
    ['vi', '13 – 20 thg 5, 2031'],
    ['en', 'May 13 – 20, 2031'],
  ] as const)('gives a trip’s first and last day in %s', (language, text) => {
    expect(formatDateSpan('2031-05-13', '2031-05-20', language)).toBe(text)
  })
})
