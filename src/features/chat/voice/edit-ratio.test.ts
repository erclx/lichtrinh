import { editRatio } from '@/features/chat/voice/edit-ratio'

describe('editRatio', () => {
  it('reads 0 for a transcript sent untouched', () => {
    expect(editRatio('doi an toi sang 8 gio', 'doi an toi sang 8 gio')).toBe(0)
  })

  it('reads 1 for a transcript rewritten', () => {
    expect(editRatio('doi an toi', 'thêm cà phê lúc 3 giờ')).toBe(1)
  })

  it('counts a diacritic added to a word as an edit', () => {
    expect(editRatio('doi an toi sang 8 gio', 'dời an toi sang 8 gio')).toBe(
      1 / 6,
    )
  })

  it('ignores case and punctuation a model writes differently', () => {
    expect(editRatio('Dời ăn tối sang 8 giờ', 'dời ăn tối sang 8 giờ?')).toBe(0)
  })

  it('drops a token that is punctuation alone', () => {
    expect(editRatio('dời ăn tối - 8 giờ', 'dời ăn tối 8 giờ')).toBe(0)
  })

  it('ignores spacing the traveler tidied', () => {
    expect(editRatio('doi  an toi ', 'doi an toi')).toBe(0)
  })

  it('counts text typed before the transcript as part of the baseline', () => {
    const landed = 'ngày mai doi an toi sang 8 gio'

    expect(editRatio(landed, 'doi an toi sang 8 gio')).toBe(2 / 8)
  })

  it('reads 1 when the box is cleared and a new request typed', () => {
    expect(editRatio('doi an toi', 'bo xe')).toBe(1)
  })
})
