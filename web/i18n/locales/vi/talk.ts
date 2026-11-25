import type { Messages } from '@/i18n/resources'

export const talk = {
  mic: 'Nói',
  micOff: 'Nút nói đang tắt vì giọng nói đang nghỉ',
  stop: 'Dừng và ghi lại',
  starting: 'Đang mở micro…',
  listening: 'Đang nghe…',
  transcribing: 'Đang ghi lại lời bạn nói…',
  slow: 'Lần đầu sau khi nghỉ sẽ lâu hơn một chút.',
  capped: 'Đã dừng ở một phút.',
  hint: 'Chạm micro để nói, chạm lần nữa để dừng. Hoặc gõ, hay chạm một câu mẫu.',
  samplesLabel: 'Câu mẫu',
  sampleCoffee: 'Thêm uống cà phê lúc 3 giờ chiều',
  sampleDinner: 'Dời ăn tối sang 8 giờ',
  sampleTaxi: 'Bỏ gọi xe ra bến thuyền',
  sampleCost: 'Hôm nay tốn bao nhiêu?',
  review: 'Đây là những gì bạn nói. Sửa nếu cần rồi gửi.',
  landed: 'Lời bạn nói đã vào ô tin nhắn.',
  retry:
    'Mình chưa nghe rõ. Bạn chạm micro nói lại chậm hơn một chút, hoặc gõ chữ nhé.',
  failed: 'Chưa ghi lại được. Bạn chạm micro thử lại, hoặc gõ chữ nhé.',
  offTitle: 'Giọng nói đang nghỉ',
  offBody:
    'Nhận giọng nói chạy trên máy ở nhà, và máy đang tắt. Bạn vẫn gõ chữ được.',
  offContact: 'Nhờ {{name}} bật lại giọng nói.',
  offAdmin: 'Nhờ quản trị viên bật lại giọng nói.',
  offSelf: 'Bật giọng nói trên máy ở nhà để dùng lại.',
  noticeBack: 'Khi giọng nói bật lại, nút nói sẽ tự sáng lên.',
  deniedTitle: 'Micro đang tắt cho ứng dụng này',
  deniedBody:
    'Để bật lại, mở Cài đặt trên iPhone, vào Safari, chọn Micro rồi chọn Cho phép. Bạn vẫn gõ chữ được.',
} satisfies Messages['talk']
