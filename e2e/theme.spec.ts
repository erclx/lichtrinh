import { expect, test } from '@playwright/test'

test.describe('theme follows the device', () => {
  test('a dark device opens the page dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })

    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('a scheme change re-themes the open page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
