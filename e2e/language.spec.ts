import { expect, test } from '@playwright/test'

test('a language chosen on the device survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('button', { name: 'VI Tiếng Việt' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
  await expect(
    page.getByRole('button', { name: 'VI Tiếng Việt' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
