import type { Messages } from '@/i18n/resources'

export const undo = {
  created: 'Đã tạo “{{title}}”',
  added: 'Đã thêm “{{title}}”',
  saved: 'Đã lưu “{{title}}”',
  deleted: 'Đã xoá “{{title}}”',
  undo: 'Hoàn tác',
  undoing: 'Đang hoàn tác…',
  undone: 'Đã hoàn tác',
  conflict: 'Không hoàn tác được vì đã có người sửa sau đó.',
  alreadyUndone: 'Việc này đã được hoàn tác rồi.',
  dismiss: 'Đóng',
} satisfies Messages['undo']
