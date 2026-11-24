import type { Messages } from '@/i18n/resources'

export const signIn = {
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
  wrong: 'Tên đăng nhập hoặc mật khẩu chưa đúng. Kiểm tra cả hai rồi thử lại.',
  pausedTitle: 'Tạm khoá đăng nhập',
  pausedBody:
    'Sai mật khẩu nhiều lần. Đợi ít phút rồi thử lại, hoặc nhắn quản trị viên.',
} satisfies Messages['signIn']
