import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { manifest, stagingManifest } from './pwa-manifest.ts'

const portOffset = Number(process.env.WORKTREE_PORT_OFFSET) || 0

// Moves local D1 state under another folder, so e2e runs and review drives
// write a throwaway copy rather than the developer's own database. The seed
// in `scripts/seed.ts` reads the same variable.
const stateRoot = process.env.LICHTRINH_STATE_ROOT
const cloudflareOptions =
  stateRoot === undefined
    ? {}
    : {
        persistState: {
          path: path.join(path.resolve(stateRoot), '.wrangler', 'state'),
        },
      }

// The released version, so a plan saved on the device by another version is
// dropped rather than read in a shape this build may not expect.
const appVersion: string = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '.release-please-manifest.json'),
    'utf8',
  ),
)['.']

// The variable the Cloudflare plugin reads too, so the names and the Worker a
// build carries always belong to one copy.
const staging = process.env.CLOUDFLARE_ENV === 'staging'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(cloudflareOptions),
    staging && {
      name: 'staging-title',
      transformIndexHtml: (html: string) =>
        html.replace(
          /<title>[^<]*<\/title>/,
          `<title>${stagingManifest.name}</title>`,
        ),
    },
    // A worker holding the built app, so a reload with no connection still
    // opens it. It never answers under `/api/`, so a cached answer cannot
    // outlive a sign-out.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: staging ? stagingManifest : manifest,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The social cards are for link previews, never read in the app.
        globIgnores: ['**/og-image*'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './web'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  // The app's own folder holds the icons and social cards, while index.html
  // and the root stay put, since the Cloudflare plugin reads wrangler.jsonc,
  // the env files, and the build output from the repository root.
  publicDir: 'web/public',
  base: process.env.VITE_BASE_URL ?? '/',
  server: {
    port: 5173 + portOffset,
    strictPort: true,
  },
  preview: {
    port: 4173 + portOffset,
    strictPort: true,
  },
})
