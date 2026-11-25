import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { E2E_BRIDGE_SECRET } from './e2e/fake-bridge'

const isCI = !!process.env.CI
const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0
const baseURL = `http://localhost:${5173 + portOffset}`
// The owner panel over a fake machine, never the workspace PC itself.
const panelPort = 4280 + portOffset
const panelURL = `http://localhost:${panelPort}`
// One folder per worktree, wiped and seeded before the server starts, so a
// run never reads the developer's database or the last run's accounts.
const stateRoot = join(tmpdir(), `lichtrinh-e2e-${portOffset}`)

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: isCI,
  // Absorbs shared-runner noise on a fresh scaffold with no flake history, at the cost of hiding a real defect until someone reads the run summary.
  retries: isCI ? 2 : 0,
  // No override here: Playwright's own CPU-derived default suits every CI runner
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    trace: 'on-first-retry',
    baseURL,
    // Nothing to wait out unless a test asserts motion. Opt back in per test with page.emulateMedia({ reducedMotion: 'no-preference' }).
    // A top-level `use.reducedMotion` works from Playwright 1.50.
    // `contextOptions` is the spelling that works on every version.
    contextOptions: { reducedMotion: 'reduce' },
  },
  // The one engine CI runs. A second would replace the chat specs' bridge on the
  // shared relay, and Linux WebKit drops the Secure cookie on http://localhost.
  projects: [
    {
      name: 'panel',
      testMatch: '**/e2e/panel/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: panelURL },
    },
    {
      name: 'chromium',
      testIgnore: '**/e2e/panel/**',
      // CI runs this project by name, so the panel rides along there alone.
      dependencies: isCI ? ['panel'] : [],
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
  ],
  webServer: [
    {
      // Seeded here rather than in a global setup, which Playwright runs only
      // after the server is already up and holding the database.
      command: `rm -rf "${stateRoot}" && bun scripts/seed.ts && bun run dev`,
      // The bridge secret is the invented one `e2e/fake-bridge.ts` presents,
      // read from the environment since a worktree and CI hold no `.dev.vars`.
      env: {
        LICHTRINH_STATE_ROOT: stateRoot,
        BRIDGE_SECRET: E2E_BRIDGE_SECRET,
        // Local mail is written to a file here and sent nowhere.
        NOTICE_FROM: 'notices@example.com',
        CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
      },
      url: baseURL,
      reuseExistingServer: false,
    },
    {
      command: 'bun run panel:build && bun e2e/panel/fake-server.ts',
      env: { PANEL_PORT: String(panelPort) },
      url: panelURL,
      reuseExistingServer: false,
    },
  ],
})
