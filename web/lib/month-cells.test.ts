import { monthCells } from '@/lib/month-cells'

describe('monthCells', () => {
  it('opens a month starting on Sunday with the six days before it', () => {
    const weeks = monthCells(2031, 6)

    expect(weeks[0]).toEqual([
      { date: '2031-05-26', inMonth: false },
      { date: '2031-05-27', inMonth: false },
      { date: '2031-05-28', inMonth: false },
      { date: '2031-05-29', inMonth: false },
      { date: '2031-05-30', inMonth: false },
      { date: '2031-05-31', inMonth: false },
      { date: '2031-06-01', inMonth: true },
    ])
  })

  it('closes a month starting on Sunday with the days after it, in six weeks', () => {
    const weeks = monthCells(2031, 6)

    expect(weeks).toHaveLength(6)
    expect(weeks[5]).toEqual([
      { date: '2031-06-30', inMonth: true },
      { date: '2031-07-01', inMonth: false },
      { date: '2031-07-02', inMonth: false },
      { date: '2031-07-03', inMonth: false },
      { date: '2031-07-04', inMonth: false },
      { date: '2031-07-05', inMonth: false },
      { date: '2031-07-06', inMonth: false },
    ])
  })

  it('opens a month starting on Monday with no day before it', () => {
    const weeks = monthCells(2031, 9)

    expect(weeks[0][0]).toEqual({ date: '2031-09-01', inMonth: true })
  })

  it('keeps the 31st of a 31-day month as its last day', () => {
    const weeks = monthCells(2031, 8)

    expect(weeks).toHaveLength(5)
    expect(weeks[4][6]).toEqual({ date: '2031-08-31', inMonth: true })
  })

  it('keeps the 29th of a leap February', () => {
    const weeks = monthCells(2032, 2)

    expect(weeks).toHaveLength(5)
    expect(weeks[4][6]).toEqual({ date: '2032-02-29', inMonth: true })
  })

  it('ends a common February on the 28th', () => {
    const weeks = monthCells(2031, 2)

    const inMonth = weeks.flat().filter((cell) => cell.inMonth)
    expect(inMonth.at(-1)).toEqual({ date: '2031-02-28', inMonth: true })
  })
})
