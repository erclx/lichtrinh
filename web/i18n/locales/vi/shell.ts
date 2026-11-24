import type { Messages } from '@/i18n/resources'

export const shell = {
  back: 'Quay lại',
  notFoundTitle: 'Không tìm thấy trang',
  notFoundBody: 'Không có gì ở địa chỉ này.',
  goToday: 'Về Hôm nay',
  unreachableTitle: 'Không kết nối được',
  unreachableBody:
    'Kiểm tra mạng rồi thử lại. Nếu vẫn không được, nhắn cho quản trị viên.',
  retry: 'Thử lại',
  loading: 'Đang tải',
} satisfies Messages['shell']
