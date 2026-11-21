import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
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
          'src/test/setup.ts',
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
            setupFiles: ['src/test/setup.ts'],
            include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'],
          },
        },
        {
          extends: true,
          plugins: [
            cloudflareTest(async () => ({
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
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
            include: ['worker/**/*.spec.ts'],
            setupFiles: ['worker/test/apply-migrations.ts'],
          },
        },
      ],
    },
  }),
)
