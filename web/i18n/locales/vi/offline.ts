import type { Messages } from '@/i18n/resources'

export const offline = {
  title: 'Đang không có mạng',
  savedAt: 'Đang xem bản lưu lúc {{time}}. Có mạng lại thì sửa được.',
  savedOn:
    'Đang xem bản lưu ngày {{date}} lúc {{time}}. Có mạng lại thì sửa được.',
  nothingSaved:
    'Máy này chưa lưu lịch trình nào. Có mạng lại thì lịch trình sẽ hiện.',
  needsConnection: 'Cần có mạng',
  editsWait: 'Cần có mạng để sửa.',
} satisfies Messages['offline']
