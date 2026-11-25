import { emailWords, pushWords } from './notice-text.ts'

// 03:20 in UTC, which is 10:20 in the zone below.
const AT = new Date('2031-05-15T03:20:00Z')
const ZONE = 'Asia/Ho_Chi_Minh'

describe('pushWords', () => {
  it("puts the sender's name ahead of a time the device fills in", () => {
    expect(
      pushWords({ kind: 'assistant', name: 'Du khách', at: AT }, 'en'),
    ).toEqual({
      title: 'The assistant is off',
      before: 'Du khách asked at ',
      at: AT.getTime(),
      after: ' for the home computer to be turned on.',
      lang: 'en',
    })
  })

  it('writes the voice notice in Vietnamese', () => {
    expect(
      pushWords({ kind: 'voice', name: 'Du khách', at: AT }, 'vi'),
    ).toMatchObject({
      title: 'Giọng nói đang nghỉ',
      before: 'Du khách nhờ bật lại giọng nói lúc ',
      after: '.',
    })
  })

  it('carries a name with markup as the text it is', () => {
    const { before } = pushWords(
      { kind: 'voice', name: '<b>An</b> {{time}}', at: AT },
      'en',
    )

    expect(before).toBe('<b>An</b> {{time}} asked at ')
  })
})

describe('emailWords', () => {
  it("tells the time on the admin's clock", () => {
    expect(
      emailWords({ kind: 'assistant', name: 'Du khách', at: AT }, 'en', ZONE),
    ).toEqual({
      subject: 'Lịch trình: the assistant is off',
      text: 'Du khách asked at 10:20 for the home computer to be turned on. Open the assistant settings to check it.',
    })
  })

  it('writes the same email in Vietnamese', () => {
    expect(
      emailWords({ kind: 'assistant', name: 'Du khách', at: AT }, 'vi', ZONE),
    ).toEqual({
      subject: 'Lịch trình: trợ lý đang tắt',
      text: 'Du khách nhờ bật máy ở nhà lúc 10:20. Mở cài đặt trợ lý để kiểm tra.',
    })
  })
})
