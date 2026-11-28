import type { Messages } from '@/i18n/resources'

export const budget = {
  title: 'Ngân sách',
  estimated: '{{trip}} · dự tính',
  about: 'khoảng {{amount}}',
  byKind: 'Chi phí theo loại',
  byDay: 'Theo ngày',
  food: 'Ăn uống',
  sights: 'Tham quan',
  activity: 'Vui chơi',
  transport: 'Đi lại',
  rest: 'Nghỉ ngơi',
  uncategorized: 'Chưa phân loại',
  uncosted_one: '{{count}} hoạt động chưa có chi phí',
  uncosted_other: '{{count}} hoạt động chưa có chi phí',
  noCosts:
    'Chưa có chi phí nào. Thêm chi phí cho một hoạt động thì sẽ hiện ở đây.',
  view: 'Kiểu biểu đồ',
  ring: 'Tròn',
  bars: 'Cột',
} satisfies Messages['budget']
