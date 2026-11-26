import type { ManifestOptions } from 'vite-plugin-pwa'

// The light ground from `web/index.css`, since a manifest holds one color and
// cannot follow the theme.
const ground = '#f8f8fc'

/** What a device reads when the app is installed to its home screen. */
export const manifest = {
  name: 'Lịch trình',
  short_name: 'Lịch trình',
  lang: 'vi',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: ground,
  theme_color: ground,
  icons: [
    {
      src: '/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
} satisfies Partial<ManifestOptions>

/** The staging copy, so its home-screen icon never reads as the real app. */
export const stagingManifest = {
  ...manifest,
  name: 'Lịch trình (staging)',
  short_name: 'Staging',
} satisfies Partial<ManifestOptions>

/** The copy a development run shares with a phone, named apart from both. */
export const previewManifest = {
  ...manifest,
  name: 'Lịch trình (preview)',
  short_name: 'Preview',
} satisfies Partial<ManifestOptions>
