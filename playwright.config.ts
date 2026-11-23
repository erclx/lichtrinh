import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { E2E_BRIDGE_SECRET } from './e2e/fake-bridge'

const isCI = !!process.env.CI
const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0
const baseURL = `http://localhost:${5173 + portOffset}`
// One folder per worktree, wiped and seeded before the server starts, so a
// run never reads the developer's database or the last run's accounts.
const stateRoot = join(tmpdir(), `lichtrinh-e2e-${portOffset}`)

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: isCI,
  // Absorbs shared-runner noise on a fresh scaffold with no flake history, at the cost of hiding a real defect until someone reads the run summary.
  retries: isCI ? 2 : 0,
  // No override here: Playwright's own CPU-derived default suits every CI runner
  reporter: isCI ? 'list' : 'html',
  use: {
    trace: 'on-first-retry',
    baseURL,
    // Nothing to wait out unless a test asserts motion. Opt back in per test with page.emulateMedia({ reducedMotion: 'no-preference' }).
    // A top-level `use.reducedMotion` works from Playwright 1.50.
    // `contextOptions` is the spelling that works on every version.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A tone in place of a microphone, granted without a prompt.
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Seeded here rather than in a global setup, which Playwright runs only
    // after the server is already up and holding the database.
    command: `rm -rf "${stateRoot}" && bun scripts/seed.ts && bun run dev`,
    // The bridge secret is the invented one `e2e/fake-bridge.ts` presents,
    // read from the environment since a worktree and CI hold no `.dev.vars`.
    env: {
      LICHTRINH_STATE_ROOT: stateRoot,
      BRIDGE_SECRET: E2E_BRIDGE_SECRET,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
    },
    url: baseURL,
    reuseExistingServer: false,
  },
})
