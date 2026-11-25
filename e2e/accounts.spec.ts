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
}) => {
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  const username = `e2e-${Date.now().toString(36)}`
  const displayName = 'Thành viên e2e'

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

  await page.getByRole('link', { name: `Edit ${displayName}` }).click()
  await page.getByRole('button', { name: 'On' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/admin\/accounts$/)
  await expect(
    page.getByRole('listitem').filter({ hasText: displayName }),
  ).toContainText('can chat')

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
