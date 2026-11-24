import type { Messages } from '@/i18n/resources'

export const errors = {
  network: 'Không kết nối được. Kiểm tra mạng rồi thử lại.',
  generic: 'Có lỗi xảy ra. Thử lại sau ít phút.',
  refreshFailed: 'Chưa làm mới được, nên thông tin có thể chưa mới nhất',
} satisfies Messages['errors']
