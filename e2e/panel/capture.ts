// Writes the owner panel's evidence frames from the fake server at
// SCREENSHOT_BASE_URL, at the widths `canon/design/panel` draws. The capture
// harness serves the app alone, so the panel's states are shot from here.
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import { chromium, type Page } from '@playwright/test'

const EVIDENCE_ROOT = 'e2e/evidence'
const WIDTHS = [1440, 834, 390]
const THEMES = [
  { name: 'default', colorScheme: 'light' },
  { name: 'dark', colorScheme: 'dark' },
] as const

interface PanelCase {
  name: string
  scenario: string
  /** A state case takes one width, where a layout case takes all three. */
  widths: readonly number[]
  setup?: (page: Page) => Promise<void>
}

const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().length === 0)

const CASES: readonly PanelCase[] = [
  { name: 'failed', scenario: 'failed', widths: WIDTHS },
  { name: 'up', scenario: 'up', widths: WIDTHS },
  {
    name: 'stop-all',
    scenario: 'staging',
    widths: WIDTHS,
    setup: async (page) => {
      await page.getByRole('button', { name: 'Stop all' }).click()
      await page.getByRole('alertdialog').waitFor()
    },
  },
  { name: 'stopped', scenario: 'stopped', widths: [1440] },
  { name: 'dropped', scenario: 'dropped', widths: [834] },
  {
    name: 'refused',
    scenario: 'refusing',
    widths: [834],
    setup: async (page) => {
      await page.getByRole('button', { name: 'Restart Voice' }).click()
      await page.getByRole('alert').waitFor()
    },
  },
]

const base = process.env.SCREENSHOT_BASE_URL
if (base === undefined) throw new Error('Set SCREENSHOT_BASE_URL')

const browser = await chromium.launch()
for (const { name, scenario, widths, setup } of CASES) {
  for (const width of widths) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        timezoneId: 'UTC',
        locale: 'en-GB',
        colorScheme: theme.colorScheme,
        reducedMotion: 'reduce',
        viewport: { width, height: 900 },
      })
      const page = await context.newPage()
      const entered = await page.request.post(`${base}/fake/enter/${scenario}`)
      if (!entered.ok()) throw new Error(`${scenario} is no fake state`)
      await page.goto(base)
      await page.getByRole('heading', { level: 1 }).waitFor()
      await setup?.(page)
      await page.evaluate(() => document.fonts.ready)
      await settled(page)
      const path = `${EVIDENCE_ROOT}/owner-panel-${name}/${width}--${theme.name}.png`
      await mkdir(dirname(path), { recursive: true })
      await page.screenshot({ path, fullPage: name !== 'stop-all' })
      await context.close()
    }
  }
}
await browser.close()
