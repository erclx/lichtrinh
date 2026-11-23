import { zoneLabel } from './zone-options'

const at = new Date('2031-05-15T02:45:00Z')

describe('zoneLabel', () => {
  it('names a renamed zone by its current city and its old one', () => {
    expect(zoneLabel('Asia/Saigon', 'en', at)).toBe(
      'Ho Chi Minh, Saigon (GMT+7)',
    )
  })

  it('names any other zone by its city and offset', () => {
    expect(zoneLabel('America/New_York', 'en', at)).toBe('New York (GMT-4)')
  })
})
