import type { Messages } from '@/i18n/resources'

export const rates = {
  title: 'Tỷ giá',
  intro:
    'Mỗi chuyến đi hiện tổng tiền ước tính theo tiền nhà từ các tỷ giá này. Nhập tỷ giá ngân hàng của bạn đưa ra.',
  loading: 'Đang tải tỷ giá…',
  loadFailed: 'Không tải được tỷ giá.',
  empty: 'Chưa có chuyến nào dùng hai loại tiền, nên chưa cần tỷ giá.',
  one: '1 {{currency}} =',
  field: 'Số {{to}} đổi được 1 {{from}}',
  swap: 'Đổi sang 1 {{currency}} trước',
  notSet: 'Chưa có tỷ giá',
  setOn: 'Đặt ngày {{date}}',
  invalid: 'Nhập một số lớn hơn 0, ví dụ 25500 hoặc 25500,5',
  save: 'Lưu',
  saving: 'Đang lưu…',
  saved: 'Đã lưu tỷ giá.',
  clear: 'Xóa',
  clearing: 'Đang xóa…',
  cleared: 'Đã xóa tỷ giá.',
} satisfies Messages['rates']
