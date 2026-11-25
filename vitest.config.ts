import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Its own prebundle, since the merged config would otherwise share
    // `node_modules/.vite` with the dev server, and a check run during a
    // review drive would rewrite the deps under the running preview.
    cacheDir: 'node_modules/.vite-vitest',
    test: {
      passWithNoTests: true,
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/e2e/**',
        '**/.{idea,git,cache,output,temp}/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'web/test/setup.ts',
          'e2e/',
          'worker/test/**',
          'worker/db/migrations/**',
          'worker/worker-configuration.d.ts',
        ],
      },
      // The Workers integration refuses a custom environment, so the browser
      // app on jsdom and the API inside workerd run as separate projects.
      projects: [
        {
          extends: true,
          test: {
            name: 'web',
            environment: 'jsdom',
            globals: true,
            setupFiles: ['web/test/setup.ts'],
            include: [
              'web/**/*.test.{ts,tsx}',
              'shared/**/*.test.ts',
              'pwa-manifest.test.ts',
            ],
          },
        },
        {
          extends: true,
          plugins: [
            cloudflareTest(async () => ({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
                  BRIDGE_SECRET: 'test-bridge-secret',
                  TEST_MIGRATIONS: await readD1Migrations(
                    path.join(import.meta.dirname, 'worker/db/migrations'),
                  ),
                  TEST_ROLLBACKS: await readD1Migrations(
                    path.join(import.meta.dirname, 'worker/db/rollbacks'),
                  ),
                },
              },
            })),
          ],
          test: {
            name: 'worker',
            include: ['worker/**/*.{test,spec}.ts'],
            setupFiles: ['worker/test/apply-migrations.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'cli',
            environment: 'node',
            include: ['cli/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'bridge',
            environment: 'node',
            include: ['bridge/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'scripts',
            environment: 'node',
            include: ['scripts/**/*.test.ts'],
          },
        },
      ],
    },
  }),
)
