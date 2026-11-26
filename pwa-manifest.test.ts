import { existsSync } from 'node:fs'
import path from 'node:path'

import { manifest, previewManifest, stagingManifest } from './pwa-manifest'

// Chrome offers an install only when a manifest carries each of these.
describe('manifest', () => {
  it('names the app', () => {
    expect(manifest.name).toBe('Lịch trình')
    expect(manifest.short_name).toBe('Lịch trình')
  })

  it('opens full screen at the root of the site', () => {
    expect(manifest).toMatchObject({
      start_url: '/',
      scope: '/',
      display: 'standalone',
    })
  })

  it.each(['192x192', '512x512'])('lists a %s icon', (sizes) => {
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ sizes, type: 'image/png', purpose: 'any' }),
    )
  })

  it('lists a maskable icon', () => {
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ purpose: 'maskable' }),
    )
  })

  it.each(manifest.icons)(
    'points at an icon file that exists, $src as $purpose',
    ({ src }) => {
      const file = path.join(import.meta.dirname, 'web/public', src)

      expect(existsSync(file)).toBe(true)
    },
  )
})

describe('previewManifest', () => {
  it('names itself the preview on the home screen and at install', () => {
    expect(previewManifest.name).toBe('Lịch trình (preview)')
    expect(previewManifest.short_name).toBe('Preview')
  })

  it('differs from the production manifest in its names alone', () => {
    expect({
      ...previewManifest,
      name: manifest.name,
      short_name: manifest.short_name,
    }).toEqual(manifest)
  })
})

describe('stagingManifest', () => {
  it('names itself staging on the home screen and at install', () => {
    expect(stagingManifest.name).toBe('Lịch trình (staging)')
    expect(stagingManifest.short_name).toBe('Staging')
  })

  it('differs from the production manifest in its names alone', () => {
    expect({
      ...stagingManifest,
      name: manifest.name,
      short_name: manifest.short_name,
    }).toEqual(manifest)
  })
})
