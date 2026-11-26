import { expect, test } from '@playwright/test'

// The one server both tests drive, so each enters its own state first and
// neither runs beside the other.
test.describe.configure({ mode: 'serial' })

test.use({ timezoneId: 'UTC', locale: 'en-GB' })

test('the owner goes from a failed voice through Stop all and Start all', async ({
  page,
  request,
}) => {
  await request.post('/fake/enter/failed')
  await page.goto('/')
  const verdict = page.getByRole('heading', { level: 1 })
  const tile = (name: string) => page.getByRole('region', { name, exact: true })

  // Voice failed, so its tile opens on the lines that say why.
  await expect(verdict).toHaveText('Voice is down')
  await expect(tile('Voice').getByRole('listitem').first()).toContainText(
    'exit 1, restart limit reached',
  )

  // The family's newest reply, with the model that wrote it.
  const messages = page.getByRole('region', { name: 'Messages' })
  const newest = messages.getByRole('listitem').first()
  await expect(newest).toContainText('Reply')
  await expect(newest).toContainText('lichtrinh-assistant')

  await page.getByRole('button', { name: 'Start voice', exact: true }).click()
  await expect(verdict).toHaveText('Everything is up')
  await expect(tile('Voice')).toContainText('Running')

  await page.getByRole('button', { name: 'Stop all' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(
    dialog.getByRole('button', { name: 'Keep running' }),
  ).toBeFocused()
  await dialog.getByRole('button', { name: 'Stop all' }).click()
  await expect(verdict).toHaveText('Everything is stopped')
  await expect(tile('Local model')).toContainText('Not loaded')

  await page.getByRole('button', { name: 'Start all' }).click()
  await expect(verdict).toHaveText('Everything is up')
  await expect(tile('Bridge')).toContainText('Connected since 14:2')
  await expect(tile('Staging')).toContainText('Off')
})

test('the page fits the narrowest phone with a failed tile open', async ({
  page,
  request,
}) => {
  await request.post('/fake/enter/failed')
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )

  expect(overflow).toBeLessThanOrEqual(0)
})
