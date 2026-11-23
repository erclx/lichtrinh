import { expect, type Page, test } from '@playwright/test'

import { FIXTURE_ACCOUNTS } from '../scripts/seed'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')

async function signIn(page: Page, username: string, password: string) {
  await page
    .getByLabel('Username')
    .or(page.getByLabel('Tên đăng nhập'))
    .fill(username)
  await page
    .getByLabel('Password', { exact: true })
    .or(page.getByLabel('Mật khẩu', { exact: true }))
    .fill(password)
  await page
    .getByRole('button', { name: 'Sign in' })
    .or(page.getByRole('button', { name: 'Đăng nhập' }))
    .click()
}

test('the admin creates a member, who signs in and is refused the accounts page', async ({
  page,
  browserName,
}) => {
  // Linux WebKit drops Secure cookies on http://localhost, unlike iPhone Safari.
  test.skip(browserName === 'webkit', 'Linux WebKit drops the Secure cookie')
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  // Each browser runs the journey against one server, so each makes its own.
  const username = `e2e-${browserName}-${Date.now().toString(36)}`
  const displayName = `Minh ${browserName}`

  await page.goto('/admin/accounts')
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await signIn(page, fixtureAdmin.username, fixtureAdmin.password)

  await expect(page).toHaveURL(/\/admin\/accounts$/)
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()

  await page.getByRole('link', { name: 'New account' }).first().click()
  await page.getByLabel('Display name').fill(displayName)
  await page.getByLabel('Username').fill(username)
  await page
    .getByRole('button', { name: 'Create and get the password' })
    .click()

  await expect(
    page.getByRole('heading', { name: `Send this password to ${displayName}` }),
  ).toBeVisible()
  const groups = await page
    .locator('span[aria-hidden="true"]')
    .filter({ hasText: /^[a-z0-9]{4}$/ })
    .allTextContents()
  const password = groups.join('')
  expect(password).toHaveLength(12)

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(displayName, { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, username, password)

  // The member's account opens in Vietnamese on a device with no choice.
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
  await expect(page.getByRole('heading', { name: 'Hôm nay' })).toBeVisible()

  await page.goto('/admin/accounts')
  await expect(
    page.getByRole('heading', { name: 'Không tìm thấy trang' }),
  ).toBeVisible()
  const refused = await page.request.get('/api/admin/users')
  expect(refused.status()).toBe(403)
})
