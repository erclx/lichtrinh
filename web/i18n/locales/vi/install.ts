import type { Messages } from '@/i18n/resources'

// Quoted names follow Apple's Vietnamese iPhone guide, since the traveler
// looks for the label Safari shows on a phone set to Vietnamese.
export const install = {
  title: 'Thêm vào màn hình chính',
  lead: 'Làm một lần trên iPhone, sau đó mở như một ứng dụng.',
  shareTitle: 'Chạm nút menu, rồi chạm “Chia sẻ”',
  shareDetail:
    'Nút menu có ba gạch hoặc ba chấm, nằm cạnh thanh địa chỉ. Nếu nút Chia sẻ đã có sẵn ở cuối màn hình thì chạm vào nút đó.',
  chooseTitle: 'Chọn “Thêm vào Màn hình chính”',
  chooseDetail:
    'Kéo xuống nếu chưa thấy. Sau đó để bật “Mở dưới dạng ứng dụng web”.',
  addTitle: 'Chạm “Thêm”',
  addDetail: 'Biểu tượng lịch xuất hiện trên màn hình',
  button: 'Cài trên thiết bị này',
  done: 'Ứng dụng đã được cài trên thiết bị này',
} satisfies Messages['install']
