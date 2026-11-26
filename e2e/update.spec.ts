import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { type BrowserContext, expect, type Page, test } from '@playwright/test'

import { DEMO_DAY, FIXTURE_ACCOUNTS } from '../scripts/seed'
import {
  buildRelease,
  type Release,
  type ReleaseServer,
  startReleaseServer,
} from './release-server'

const fixtureAdmin = FIXTURE_ACCOUNTS.find(({ role }) => role === 'admin')
const dayPath = `/trips/${DEMO_DAY.tripId}/days/${DEMO_DAY.date}`
const addPath = `/entries/new?${new URLSearchParams({ trip: DEMO_DAY.tripId, date: DEMO_DAY.date })}`
const settle = { timeout: 15_000 }

let scratch: string
let older: Release
let newer: Release
let server: ReleaseServer

/** The entry script the page runs, or null while it reloads. */
async function running(page: Page) {
  try {
    return await page.evaluate(
      () =>
        document
          .querySelector('script[type="module"][src]')
          ?.getAttribute('src') ?? null,
    )
  } catch {
    return null
  }
}

async function signIn(context: BrowserContext) {
  if (fixtureAdmin === undefined) throw new Error('The seed holds no admin')
  const answer = await context.request.post('/api/auth/sign-in', {
    data: { username: fixtureAdmin.username, password: fixtureAdmin.password },
  })
  expect(answer.ok()).toBe(true)
}

/** Opens the older release and waits until its worker controls the page. */
async function installOlder(page: Page, at = '/') {
  await page.goto(server.url + at)
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    settle,
  )
  expect(await running(page)).toBe(older.entry)
}

/** Waits until the worker behind `page` saves `release`. */
async function waitSaved(page: Page, release: Release) {
  await expect
    .poll(
      () => page.evaluate(() => fetch('/index.html').then((r) => r.text())),
      settle,
    )
    .toContain(release.entry)
}

/** Asks for an update by hand, standing in for the browser's own check. */
async function checkForUpdate(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  })
}

/** The app coming back to the screen, as a resumed home-screen app does. */
async function show(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  )
}

async function tap(page: Page) {
  await page.getByRole('heading', { level: 1 }).first().click()
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  scratch = await mkdtemp(path.join(tmpdir(), 'lichtrinh-releases-'))
  older = await buildRelease('0.0.0-older', path.join(scratch, 'older'))
  newer = await buildRelease('0.0.0-newer', path.join(scratch, 'newer'))
  expect(newer.entry).not.toBe(older.entry)
})

test.afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

test.beforeEach(async ({ baseURL, context }) => {
  if (baseURL === undefined) throw new Error('No dev server to sign in on')
  server = await startReleaseServer(baseURL, older)
  await signIn(context)
})

test.afterEach(async () => {
  await server.close()
})

test.describe('a new release', () => {
  test('runs on the next load, with no window closed', async ({ page }) => {
    await installOlder(page)

    server.serve(newer)
    await page.reload()

    await expect.poll(() => running(page), settle).toBe(newer.entry)
  })

  test('reaches a page shown again', async ({ page }) => {
    await installOlder(page)
    await tap(page)

    server.serve(newer)
    await show(page)

    await expect.poll(() => running(page), settle).toBe(newer.entry)
  })

  test('waits on a tapped page until its next in-app link', async ({
    page,
  }) => {
    await installOlder(page)
    await tap(page)
    server.serve(newer)
    await checkForUpdate(page)
    await waitSaved(page, newer)
    expect(await running(page)).toBe(older.entry)

    await page.getByRole('link', { name: 'Trips' }).first().click()

    await expect.poll(() => running(page), settle).toBe(newer.entry)
    expect(new URL(page.url()).pathname).toBe('/trips')
  })

  test('runs in a window opened at once after a shown one closes', async ({
    context,
    page,
  }) => {
    await installOlder(page)
    await tap(page)
    server.serve(newer)

    await show(page)
    await page.close()
    const reopened = await context.newPage()
    await reopened.goto(server.url)

    await expect.poll(() => running(reopened), settle).toBe(newer.entry)
  })
})

test.describe('a new release beside a draft', () => {
  test('keeps a draft in Add, and moves once the traveler leaves Add', async ({
    page,
  }) => {
    await installOlder(page, addPath)
    await page.getByLabel('What is it?').fill('Coffee break')
    server.serve(newer)

    await show(page)
    await waitSaved(page, newer)

    expect(await running(page)).toBe(older.entry)
    await expect(page.getByLabel('What is it?')).toHaveValue('Coffee break')
    await page.getByRole('link', { name: 'Back' }).click()
    await expect.poll(() => running(page), settle).toBe(newer.entry)
  })

  test('moves the other window and leaves the draft in its own', async ({
    context,
    page,
  }) => {
    await installOlder(page, addPath)
    await page.getByLabel('What is it?').fill('Coffee break')
    const other = await context.newPage()
    await other.goto(server.url + dayPath)
    expect(await running(other)).toBe(older.entry)
    server.serve(newer)

    await show(other)

    await expect.poll(() => running(other), settle).toBe(newer.entry)
    await waitSaved(page, newer)
    expect(await running(page)).toBe(older.entry)
    await expect(page.getByLabel('What is it?')).toHaveValue('Coffee break')
  })
})
