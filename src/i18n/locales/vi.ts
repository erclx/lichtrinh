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
} satisfies Messages
