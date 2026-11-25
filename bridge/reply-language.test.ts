import { describe, expect, it } from 'vitest'

import { repliesInEnglish } from './reply-language.ts'

describe('repliesInEnglish', () => {
  it.each([
    'Added "Uống cà phê" on Saturday at 15:00.',
    'Removed Đi thuyền vịnh Sương.',
    'Renamed to Ăn tối ở chợ đêm.',
    'This would remove Ăn sáng and Dạo phố đêm. Are you sure?',
    'The estimated total is 420,000 VND.',
    'Estimated total: 420,000 VND.',
    'The estimated total cost is 420,000 VND (boat trip 300,000 VND, museum ticket 120,000 VND).',
    'Moved the boat trip on vịnh Sương to 15:00.',
  ])('reads %j as English around its Vietnamese titles', (reply) => {
    const titles = [
      'Uống cà phê',
      'Đi thuyền vịnh Sương',
      'Ăn tối ở chợ đêm',
      'Ăn sáng',
      'Dạo phố đêm',
    ]

    expect(repliesInEnglish(reply, titles)).toBe(true)
  })

  it.each([
    'Đã thêm "Uống cà phê" vào thứ Bảy lúc 15:00.',
    'Tổng chi phí dự kiến là 420.000 đồng.',
    'Mình đã đổi lịch đó sang 3 PM, ngày 12 tháng 4.',
    'Done. Mình đã thêm lịch vào thứ Bảy lúc 15:00.',
    'I added it to Saturday. Mình đã chọn một giờ, bạn cứ báo nếu muốn đổi.',
  ])('reads %j as not English', (reply) => {
    expect(repliesInEnglish(reply, ['Uống cà phê'])).toBe(false)
  })

  it('reads a reply of nothing but a title as not English', () => {
    expect(repliesInEnglish('Uống cà phê.', ['Uống cà phê'])).toBe(false)
  })

  it('reads an empty reply as not English', () => {
    expect(repliesInEnglish('', [])).toBe(false)
  })
})
