import { expect, type Page, test } from '@playwright/test'

interface ThemeRecord {
  themeAtBody?: string
  schemeChanged?: Promise<void>
}

/**
 * Stores an appearance before any page script runs, and records the theme
 * the moment the body element is parsed. The head script has run by then and
 * nothing has painted, so that reading is the theme of the first frame.
 */
async function storeAppearanceBeforeLoad(page: Page, appearance: string) {
  await page.addInitScript((value) => {
    localStorage.setItem('lichtrinh.theme', value)
    const record = window as unknown as ThemeRecord
    new MutationObserver((_, observer) => {
      if (document.body === null) return
      record.themeAtBody = document.documentElement.dataset.theme
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  }, appearance)
}

function themeAtBody(page: Page) {
  return page.evaluate(() => (window as unknown as ThemeRecord).themeAtBody)
}

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

test.describe('a stored appearance overrides the device', () => {
  test('a reload in Dark paints dark from the first frame', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await storeAppearanceBeforeLoad(page, 'dark')
    await page.goto('/')

    await page.reload()

    expect(await themeAtBody(page)).toBe('dark')
  })

  test('Light stays light when the device turns dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await storeAppearanceBeforeLoad(page, 'light')
    await page.goto('/')
    // Registered after the head script's listener, so it fires second.
    await page.evaluate(() => {
      const record = window as unknown as ThemeRecord
      record.schemeChanged = new Promise((resolve) => {
        window
          .matchMedia('(prefers-color-scheme: dark)')
          .addEventListener('change', () => resolve(), { once: true })
      })
    })

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.evaluate(() => (window as unknown as ThemeRecord).schemeChanged)

    expect(await page.locator('html').getAttribute('data-theme')).toBe('light')
  })
})
