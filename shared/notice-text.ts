import type { Language } from './auth.ts'
import type { NoticeKind } from './notices.ts'

// The Worker builds these words, so they cannot live with the app's own
// translation files. A missing language or kind fails `tsc`.

/**
 * What a push carries. The device puts its own clock's time between `before`
 * and `after`, since the server knows no device's time zone. The parts stay
 * apart so a name holding a placeholder is never read as one.
 */
export interface PushWords {
  title: string
  before: string
  /** When the notice was asked for, in epoch milliseconds. */
  at: number
  after: string
  lang: Language
}

export interface EmailWords {
  subject: string
  text: string
}

interface Words {
  pushTitle: string
  subject: string
  before: string
  after: string
}

// The sender's name comes ahead of `before` in both languages.
const WORDS: Record<Language, Record<NoticeKind, Words>> = {
  en: {
    assistant: {
      pushTitle: 'The assistant is off',
      subject: 'Lịch trình: the assistant is off',
      before: 'asked at',
      after: ' for the home computer to be turned on.',
    },
    voice: {
      pushTitle: 'Voice is off',
      subject: 'Lịch trình: voice is off',
      before: 'asked at',
      after: ' for voice to be turned back on.',
    },
  },
  vi: {
    assistant: {
      pushTitle: 'Trợ lý đang tắt',
      subject: 'Lịch trình: trợ lý đang tắt',
      before: 'nhờ bật máy ở nhà lúc',
      after: '.',
    },
    voice: {
      pushTitle: 'Giọng nói đang nghỉ',
      subject: 'Lịch trình: giọng nói đang nghỉ',
      before: 'nhờ bật lại giọng nói lúc',
      after: '.',
    },
  },
}

const CHECK: Record<Language, string> = {
  en: 'Open the assistant settings to check it.',
  vi: 'Mở cài đặt trợ lý để kiểm tra.',
}

const TEST_EMAIL: Record<Language, EmailWords> = {
  en: {
    subject: 'Lịch trình: test email',
    text: 'This address gets an email when the assistant or voice is off and someone taps Notify.',
  },
  vi: {
    subject: 'Lịch trình: email thử',
    text: 'Địa chỉ này sẽ nhận email khi trợ lý hoặc giọng nói tắt và có người bấm Báo.',
  },
}

export interface Notice {
  kind: NoticeKind
  /** The sender's display name, plain text everywhere it lands. */
  name: string
  at: Date
}

export function pushWords(notice: Notice, lang: Language): PushWords {
  const { pushTitle, before, after } = WORDS[lang][notice.kind]
  return {
    title: pushTitle,
    before: `${notice.name} ${before} `,
    at: notice.at.getTime(),
    after,
    lang,
  }
}

export function emailWords(
  notice: Notice,
  lang: Language,
  timeZone: string,
): EmailWords {
  const { subject, before, after } = WORDS[lang][notice.kind]
  const time = new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(notice.at)
  return {
    subject,
    text: `${notice.name} ${before} ${time}${after} ${CHECK[lang]}`,
  }
}

export function testEmailWords(lang: Language): EmailWords {
  return TEST_EMAIL[lang]
}
