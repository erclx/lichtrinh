import { expect, type Page, test } from '@playwright/test'

import {
  DEMO_DAY,
  DEMO_INSTANT,
  FIXTURE_ACCOUNTS,
  FIXTURE_ASSISTANT_ENTRY,
} from '../scripts/seed'
import { connectFakeBridge } from './fake-bridge'

const traveler = FIXTURE_ACCOUNTS.find(({ canChat }) => canChat)
const tomorrow = FIXTURE_ASSISTANT_ENTRY.startsOn
const dayPath = `/trips/${DEMO_DAY.tripId}/days/${tomorrow}`

/** Opens a new outage, so a retried run finds no notice from the one before. */
async function openOutage(page: Page, baseURL: string) {
  await (await connectFakeBridge(baseURL)).close()
  await expect
    .poll(
      async () => {
        const status = await page.request.get('/api/assistant/status')
        return ((await status.json()) as { online: boolean }).online
      },
      { timeout: 5_000 },
    )
    .toBe(false)
}

test('the traveler tells the admin the assistant is off, then chats with it and undoes its add', async ({
  page,
  baseURL,
}) => {
  if (traveler === undefined) throw new Error('The seed holds no traveler')
  if (baseURL === undefined) throw new Error('The config names no base URL')
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'en'),
  )
  await page.clock.setFixedTime(new Date(DEMO_INSTANT))
  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: traveler.username, password: traveler.password },
  })
  expect(signIn.ok()).toBe(true)

  await openOutage(page, baseURL)
  await page.goto('/chats/fixture-chat-today')
  await expect(
    page.getByRole('heading', { name: 'The assistant is offline' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Notify the admin' }).click()
  const sent = page.getByText(/^Notice sent to the admin/)
  await expect(sent).toBeVisible()
  await page.reload()
  await expect(sent).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Notify the admin' }),
  ).toHaveCount(0)
  await page.goto(dayPath)
  await expect(
    page.getByRole('link', { name: new RegExp(FIXTURE_ASSISTANT_ENTRY.title) }),
  ).toBeVisible()

  const bridge = await connectFakeBridge(baseURL)
  try {
    await page.goto('/chats/fixture-chat-today')
    const box = page.getByLabel('Message the assistant')
    await expect(box).toBeEnabled()
    const answered = bridge.answerWithAdd(
      { title: 'Cà phê sáng', date: tomorrow, start: '09:00' },
      'Xong, mình đã thêm cà phê sáng mai lúc 9 giờ.',
    )
    await box.fill('ca phe sang mai luc 9 gio')
    await box.press('Enter')
    await answered

    const undo = page.getByRole('button', { name: 'Undo “Cà phê sáng”' })
    await expect(undo).toBeVisible()
    await page.goto(dayPath)
    const added = page.getByRole('link', { name: /Cà phê sáng/ })
    await expect(added).toBeVisible()
    await page.goBack()
    await page.getByRole('button', { name: 'Undo “Cà phê sáng”' }).click()
    await expect(page.getByText('Undone', { exact: true })).toBeVisible()

    await page.goto(dayPath)
    await expect(
      page.getByRole('link', {
        name: new RegExp(FIXTURE_ASSISTANT_ENTRY.title),
      }),
    ).toBeVisible()
    await expect(added).toHaveCount(0)
  } finally {
    await bridge.close()
  }
})

/** The live words show whole above Stop with the thread scrolled `share` down. */
async function expectAboveStop(page: Page, share: number) {
  await page.evaluate((at) => {
    scrollTo(0, at * (document.body.scrollHeight - innerHeight))
  }, share)
  const words = page.getByText('doi an toi', { exact: true })
  await expect(words).toBeInViewport({ ratio: 1 })
  const [wordsBox, stopBox] = await Promise.all([
    words.boundingBox(),
    page.getByRole('button', { name: 'Stop and write it down' }).boundingBox(),
  ])
  if (wordsBox === null || stopBox === null) throw new Error('No box')
  expect(wordsBox.y + wordsBox.height).toBeLessThanOrEqual(stopBox.y)
}

// Runs after the journey above in the same worker, since the relay holds one
// bridge per server and a second spec file would run beside it.
test('the traveler speaks a request, fixes the transcript, sends it, and types while voice is off', async ({
  page,
  baseURL,
}) => {
  if (traveler === undefined) throw new Error('The seed holds no traveler')
  if (baseURL === undefined) throw new Error('The config names no base URL')
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'en'),
  )
  await page.clock.setFixedTime(new Date(DEMO_INSTANT))
  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: traveler.username, password: traveler.password },
  })
  expect(signIn.ok()).toBe(true)

  const bridge = await connectFakeBridge(baseURL, { voice: true })
  try {
    // Short enough that the thread scrolls under its composer.
    await page.setViewportSize({ width: 390, height: 400 })
    await page.goto('/chats/fixture-chat-today')
    await page.getByRole('button', { name: 'Talk' }).click()
    const stop = page.getByRole('button', { name: 'Stop and write it down' })
    await expect(stop).toBeVisible()
    await expect(
      page.getByText('Listening…', { exact: true }).first(),
    ).toBeVisible()

    const words = page.getByText('doi an toi', { exact: true })
    await bridge.answerLive('doi an toi')
    await expect(words).toBeVisible()
    expect(
      await page.evaluate(() => document.body.scrollHeight - innerHeight),
    ).toBeGreaterThan(150)
    await expectAboveStop(page, 0)
    await expectAboveStop(page, 0.5)
    await expectAboveStop(page, 1)

    const transcribed = bridge.answerClip('doi an toi sang 8 gio', 800)
    await stop.click()
    await expect(
      page.getByText('Writing down what you said…').first(),
    ).toBeVisible()
    await transcribed

    const box = page.getByLabel('Message the assistant')
    await expect(box).toHaveValue('doi an toi sang 8 gio')
    await expect(words).toHaveCount(0)
    await expect(
      page.getByText('This is what you said. Fix it if needed, then send.'),
    ).toBeVisible()

    await box.fill('dời ăn tối sang 8 giờ')
    const replied = bridge.answerWithReply('Xong, mình đã dời ăn tối.')
    await box.press('Enter')
    await replied
    await expect(
      page.locator('ol').getByText('Xong, mình đã dời ăn tối.'),
    ).toBeVisible()

    bridge.setVoice(false)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Voice is offline' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Talk' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const typedReply = bridge.answerWithReply('Hôm nay khoảng 1.200.000 ₫.')
    await box.fill('hom nay ton bao nhieu')
    await box.press('Enter')
    await typedReply
    await expect(
      page.locator('ol').getByText('Hôm nay khoảng 1.200.000 ₫.'),
    ).toBeVisible()
  } finally {
    await bridge.close()
  }
})

/** Whether the newest row shows whole on screen, under nothing such as the message row. */
async function newestShowsWhole(page: Page) {
  return page.evaluate(() => {
    const newest = [...document.querySelectorAll('ol > li')].at(-1)
    if (newest === undefined) throw new Error('The thread shows no rows')
    const box = newest.getBoundingClientRect()
    const x = box.left + box.width / 2
    return (
      box.top >= 0 &&
      box.bottom <= innerHeight &&
      [box.top + 1, box.bottom - 1].every((y) =>
        newest.contains(document.elementFromPoint(x, y)),
      )
    )
  })
}

const fromEnd = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollHeight - scrollY - innerHeight,
  )

test('an opened chat lands on its newest message, and a reader scrolled up stays there', async ({
  page,
  baseURL,
}) => {
  if (traveler === undefined) throw new Error('The seed holds no traveler')
  if (baseURL === undefined) throw new Error('The config names no base URL')
  await page.addInitScript(() =>
    localStorage.setItem('lichtrinh.language', 'en'),
  )
  await page.clock.setFixedTime(new Date(DEMO_INSTANT))
  const signIn = await page.request.post('/api/auth/sign-in', {
    data: { username: traveler.username, password: traveler.password },
  })
  expect(signIn.ok()).toBe(true)
  await page.setViewportSize({ width: 390, height: 600 })

  await openOutage(page, baseURL)
  await page.goto('/chats/fixture-chat-today')
  await expect(
    page.getByRole('heading', { name: 'The assistant is offline' }),
  ).toBeVisible()
  await expect.poll(() => newestShowsWhole(page)).toBe(true)

  const bridge = await connectFakeBridge(baseURL, { voice: true })
  try {
    bridge.setVoice(false)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Voice is offline' }),
    ).toBeVisible()
    await expect.poll(() => newestShowsWhole(page)).toBe(true)

    await page.mouse.move(195, 200)
    await page.mouse.wheel(0, -300)
    await expect.poll(() => fromEnd(page)).toBeGreaterThan(200)
    await page.setViewportSize({ width: 430, height: 600 })
    // A resize observer scrolls ahead of the next paint, so two frames cover it.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    )
    expect(await fromEnd(page)).toBeGreaterThan(64)
  } finally {
    await bridge.close()
  }
})
