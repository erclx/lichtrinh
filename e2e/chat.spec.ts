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
  browserName,
  baseURL,
}) => {
  test.skip(
    browserName !== 'chromium',
    "The relay holds one bridge per server, so a second engine's bridge would replace this one mid-turn, and Linux WebKit drops the Secure cookie",
  )
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
