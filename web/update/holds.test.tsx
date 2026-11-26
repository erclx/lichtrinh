import { render } from '@testing-library/react'

import { hold, isHeld, safeWhenEmpty, useHold } from '@/update/holds'

function Holding({ active }: { active: boolean }) {
  useHold(active)
  return null
}

describe('hold', () => {
  it('leaves an empty screen free to reload', () => {
    expect(isHeld()).toBe(false)
  })

  it('holds until its release is called', () => {
    const release = hold()
    expect(isHeld()).toBe(true)

    release()

    expect(isHeld()).toBe(false)
  })

  it('keeps holding while a second hold stands after the first lets go', () => {
    const first = hold()
    const second = hold()

    first()

    expect(isHeld()).toBe(true)
    second()
  })
})

describe('useHold', () => {
  it('holds while mounted active and lets go on unmount', () => {
    const { unmount } = render(<Holding active />)
    expect(isHeld()).toBe(true)

    unmount()

    expect(isHeld()).toBe(false)
  })

  it('follows its flag', () => {
    const { rerender, unmount } = render(<Holding active={false} />)
    expect(isHeld()).toBe(false)

    rerender(<Holding active />)
    expect(isHeld()).toBe(true)

    rerender(<Holding active={false} />)
    expect(isHeld()).toBe(false)
    unmount()
  })
})

describe('the field scan', () => {
  it('holds on any form on screen, even with no words typed', () => {
    const { unmount } = render(
      <form>
        <select defaultValue="meal" aria-label="Kind">
          <option value="meal">Meal</option>
        </select>
      </form>,
    )

    expect(isHeld()).toBe(true)
    unmount()
  })

  it('leaves a form marked safe free while its fields are empty', () => {
    const { unmount } = render(
      <form {...safeWhenEmpty}>
        <input aria-label="Name" defaultValue="" />
        <textarea aria-label="Message" defaultValue="" />
        <button type="submit">Send</button>
      </form>,
    )

    expect(isHeld()).toBe(false)
    unmount()
  })

  it('holds on a form marked safe once an input holds text', () => {
    const { unmount } = render(
      <form {...safeWhenEmpty}>
        <input aria-label="Name" defaultValue="an" />
      </form>,
    )

    expect(isHeld()).toBe(true)
    unmount()
  })

  it('holds on a form marked safe once a text area holds text', () => {
    const { unmount } = render(
      <form {...safeWhenEmpty}>
        <textarea aria-label="Message" defaultValue="ca phe" />
      </form>,
    )

    expect(isHeld()).toBe(true)
    unmount()
  })

  it('lets go once the form leaves the screen', () => {
    const { unmount } = render(<form />)

    unmount()

    expect(isHeld()).toBe(false)
  })
})
