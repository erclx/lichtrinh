import { expect, test } from '@playwright/test'

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

test('the traveler reads the offline card, then chats with the assistant and undoes its add', async ({
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

  await page.goto('/chats/fixture-chat-today')
  await expect(
    page.getByRole('heading', { name: 'The assistant is offline' }),
  ).toBeVisible()
  await expect(
    page.getByText('Ask the admin to turn it back on.'),
  ).toBeVisible()
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
