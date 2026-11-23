import type { Messages } from '../resources'

export const vi = {
  app: {
    name: 'Lịch trình',
  },
  language: {
    groupLabel: 'Language / Ngôn ngữ',
    vi: 'VI',
    en: 'EN',
    viName: 'Tiếng Việt',
    enName: 'English',
  },
  controls: {
    close: 'Đóng',
    done: 'Xong',
    filterLabel: 'Tìm trong danh sách',
    filterPlaceholder: 'Gõ vài chữ',
    noMatch: 'Không có mục nào khớp với “{{query}}”',
    clearFilter: 'Xoá ô tìm',
    from: 'Đi ngày',
    to: 'Về ngày',
    noDate: 'Chọn ngày',
    tripDates: 'Ngày đi và về',
    previousMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    pickFirstDay: 'Chọn ngày đi',
    pickLastDay: 'chọn ngày về',
    rangeTo: 'đến',
    // Vietnamese has one plural form, so i18next reads `_other` alone.
    dayCount_one: '{{count}} ngày',
    dayCount_other: '{{count}} ngày',
    delete: 'Xoá',
  },
  signIn: {
    lead: 'Đăng nhập một lần, ứng dụng nhớ bạn nhiều tháng.',
    username: 'Tên đăng nhập',
    password: 'Mật khẩu',
    show: 'Hiện',
    showLabel: 'Hiện mật khẩu',
    submit: 'Đăng nhập',
    submitting: 'Đang đăng nhập…',
    forgot: 'Quên mật khẩu? Nhắn cho quản trị viên.',
    usernameRequired: 'Nhập tên đăng nhập.',
    passwordRequired: 'Nhập mật khẩu.',
    wrong:
      'Tên đăng nhập hoặc mật khẩu chưa đúng. Kiểm tra cả hai rồi thử lại.',
    pausedTitle: 'Tạm khoá đăng nhập',
    pausedBody:
      'Sai mật khẩu nhiều lần. Đợi ít phút rồi thử lại, hoặc nhắn quản trị viên.',
  },
  errors: {
    network: 'Không kết nối được. Kiểm tra mạng rồi thử lại.',
    generic: 'Có lỗi xảy ra. Thử lại sau ít phút.',
  },
} satisfies Messages
