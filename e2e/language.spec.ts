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

test.describe('the pressed language keeps its fill under the pointer', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`in ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      // Without transitions every computed color is the settled one, so the
      // read after the hover cannot pass on the first frame of a fade.
      await page.addStyleTag({
        content: '* { transition: none !important; }',
      })
      const pressed = page.getByRole('button', { name: 'EN English' })
      await page.getByRole('button', { name: 'VI Tiếng Việt' }).click()
      await pressed.click()
      await page.mouse.move(0, 0)
      await expect(pressed).toHaveAttribute('aria-pressed', 'true')
      const fill = await pressed.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )

      await pressed.hover()

      await expect(pressed).toHaveCSS('background-color', fill)
    })
  }
})
