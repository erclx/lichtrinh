import type { Messages } from '@/i18n/resources'

export const assistantSettings = {
  title: 'Trợ lý',
  loading: 'Đang tải cài đặt trợ lý…',
  loadFailed: 'Không tải được cài đặt trợ lý.',
  homeComputer: 'Máy ở nhà',
  online: 'Đang bật',
  offline: 'Đang tắt',
  lastAnsweredToday: 'Trợ lý trả lời lần cuối lúc {{time}} hôm nay.',
  lastAnsweredOn: 'Trợ lý trả lời lần cuối ngày {{date}}.',
  neverAnswered: 'Trợ lý chưa trả lời lần nào.',
  modelHeading: 'Mô hình trợ lý',
  modelQwen: 'Qwen',
  modelQwenHint: 'Mặc định · hiểu kỹ nhất',
  modelGemma: 'Gemma',
  modelGemmaHint: 'Trả lời nhanh hơn',
  modelSaved:
    'Đã lưu. Câu trả lời tiếp theo có thể lâu hơn một chút vì mô hình này đang tải.',
  contactLabel: 'Tên hiện khi trợ lý nghỉ',
  contactHint:
    'Khi trợ lý nghỉ, người đi sẽ thấy tên này là người cần liên hệ. Để trống thì hiện Quản trị viên.',
  contactTooLong: 'Tên tối đa 60 ký tự.',
  save: 'Lưu',
  saving: 'Đang lưu…',
  contactSaved: 'Đã lưu.',
  contactCleared: 'Đã xoá. Người đi sẽ thấy Quản trị viên.',
  note: 'Chỉ quản trị viên thấy trang này. Đổi mô hình có hiệu lực từ tin nhắn sau.',
  notify: {
    heading: 'Báo cho tôi qua',
    hint: 'Khi trợ lý hoặc giọng nói tắt và có người bấm Báo.',
    push: 'Thông báo đẩy',
    email: 'Email',
    on: 'Bật',
    off: 'Tắt',
    deviceOn:
      'Đang bật trên thiết bị này. Mỗi điện thoại hay máy tính bật riêng.',
    deviceOff: 'Mỗi điện thoại hay máy tính bật riêng.',
    asking: 'Chọn Cho phép ở câu hỏi máy vừa hiện.',
    blocked:
      'Máy đang chặn thông báo của ứng dụng này. Cho phép trong cài đặt của máy rồi chọn Bật lại.',
    install:
      'Trên iPhone hoặc iPad, thêm ứng dụng vào màn hình chính trước, rồi bật ở đó.',
    addToHome: 'Thêm vào màn hình chính',
    unsupported:
      'Trình duyệt này không hiện được thông báo. Hãy bật trên thiết bị khác.',
    none: 'Hiện không ai nhận thông báo. Người đi chỉ thấy nên nhờ ai.',
    address: 'Địa chỉ email',
    invalid: 'Nhập địa chỉ email như name@example.com',
    unconfirmed:
      'Hãy xác nhận địa chỉ này trong Cloudflare trước, rồi bấm Lưu lại',
    saved: 'Đã lưu. Một email thử đang được gửi.',
    testFailed:
      'Chưa gửi được email thử nên địa chỉ chưa được lưu. Bạn thử lại sau nhé.',
  },
  speech: {
    heading: 'Nhận giọng nói',
    qwen: 'Qwen3-ASR',
    qwenHint: 'Mặc định',
    whisper: 'Whisper turbo',
    whisperHint: 'Nhanh',
    phowhisper: 'PhoWhisper',
    phowhisperHint: 'Nghe tiếng Việt · nói tiếng Anh dùng Qwen3-ASR',
    unused: 'Chưa dùng',
    unsent_one: '{{count}} đoạn · chưa gửi đoạn nào',
    unsent_other: '{{count}} đoạn · chưa gửi đoạn nào',
    usage_one: 'Đã gửi {{sent}}/{{count}} đoạn · sửa {{share}} số chữ',
    usage_other: 'Đã gửi {{sent}}/{{count}} đoạn · sửa {{share}} số chữ',
    saved:
      'Đã lưu. Đoạn sau sẽ dùng mô hình này và có thể lâu hơn một chút khi nạp.',
  },
} satisfies Messages['assistantSettings']
