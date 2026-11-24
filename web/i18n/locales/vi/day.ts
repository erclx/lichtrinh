import type { Messages } from '@/i18n/resources'

export const day = {
  add: 'Thêm',
  addOn: 'Thêm hoạt động vào {{date}}',
  tripDay: '{{trip}} · Ngày {{number}} / {{total}}',
  estimated: 'Dự tính',
  empty: 'Chưa có hoạt động nào hôm này.',
  happeningNow: 'Đang diễn ra',
  timeLeft: 'còn {{duration}}',
  done: 'Xong',
  daysLabel: 'Các ngày trong chuyến',
  today: 'Hôm nay',
  loadFailed: 'Chưa tải được ngày này.',
  notInTrip: 'Ngày này không nằm trong chuyến đi.',
} satisfies Messages['day']
