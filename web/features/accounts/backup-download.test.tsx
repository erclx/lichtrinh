import '@/i18n/setup'

import type { Backup } from '@shared/backup.ts'
import { backup } from '@shared/backup.ts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BackupDownload } from '@/features/accounts/backup-download'
import { applyLanguage } from '@/i18n/setup'
import { failure, fakeApi, json, offline } from '@/test/fake-api'

const ROUTE = 'GET /admin/backup'

function aBackup(overrides: Partial<Backup> = {}): Backup {
  return {
    format: 'lichtrinh-backup',
    formatVersion: 1,
    exportedAt: '2031-04-09T22:15:00.000Z',
    trips: [
      {
        trip: {
          id: 'trip-coast',
          name: 'Trip to Bờ Cát',
          startsOn: '2031-04-10',
          endsOn: '2031-04-16',
          timeZone: 'Asia/Ho_Chi_Minh',
          currency: 'VND',
          homeCurrency: 'USD',
          version: 1,
        },
        entries: [],
      },
    ],
    ...overrides,
  }
}

interface SavedFile {
  name: string
  href: string
}

/**
 * Stands in for the browser's save, which jsdom has none of, and keeps each
 * file the page hands over under the name it asks for.
 */
function fakeSaves() {
  const blobs = new Map<string, Blob>()
  const saved: SavedFile[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const href = `blob:invented-${blobs.size}`
    blobs.set(href, blob as Blob)
    return href
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, href: this.href })
  })
  return { saved, textOf: (file: SavedFile) => blobs.get(file.href)?.text() }
}

beforeEach(async () => {
  // jsdom defines neither, so each needs a function to spy on.
  URL.createObjectURL ??= () => ''
  URL.revokeObjectURL ??= () => {}
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('BackupDownload', () => {
  it('saves the backup as a file named for the day it was exported', async () => {
    const user = userEvent.setup()
    fakeApi({ [ROUTE]: () => json(aBackup()) })
    const { saved } = fakeSaves()
    render(<BackupDownload />)

    await user.click(screen.getByRole('button', { name: 'Download backup' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'lichtrinh-backup-2031-04-09.json',
    )
    expect(saved.map(({ name }) => name)).toEqual([
      'lichtrinh-backup-2031-04-09.json',
    ])
  })

  it('saves a file that reads back as the same backup', async () => {
    const user = userEvent.setup()
    fakeApi({ [ROUTE]: () => json(aBackup()) })
    const { saved, textOf } = fakeSaves()
    render(<BackupDownload />)

    await user.click(screen.getByRole('button', { name: 'Download backup' }))
    await screen.findByRole('status')

    const text = await textOf(saved[0])
    expect(backup.parse(JSON.parse(text ?? ''))).toEqual(aBackup())
  })

  it('says it is downloading and sends one request while it waits', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ [ROUTE]: () => new Promise<Response>(() => {}) })
    render(<BackupDownload />)
    await user.click(screen.getByRole('button', { name: 'Download backup' }))

    const waiting = screen.getByRole('button', { name: 'Downloading…' })
    await user.click(waiting)

    expect(waiting).toHaveAttribute('aria-busy', 'true')
    expect(api.requests).toHaveLength(1)
  })

  it.each([
    ['en', 'Download backup', "Can't connect"],
    ['vi', 'Tải bản sao lưu', 'Không kết nối được'],
  ] as const)(
    'says there is no connection in %s and saves nothing',
    async (language, label, message) => {
      const user = userEvent.setup()
      await applyLanguage(language)
      fakeApi({ [ROUTE]: () => offline() })
      const { saved } = fakeSaves()
      render(<BackupDownload />)

      await user.click(screen.getByRole('button', { name: label }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(saved).toEqual([])
    },
  )

  it.each([
    ['en', 'Download backup', 'Something went wrong'],
    ['vi', 'Tải bản sao lưu', 'Có lỗi xảy ra'],
  ] as const)(
    'says a refused download failed in %s and saves nothing',
    async (language, label, message) => {
      const user = userEvent.setup()
      await applyLanguage(language)
      fakeApi({ [ROUTE]: () => failure('internal_error', 500) })
      const { saved } = fakeSaves()
      render(<BackupDownload />)

      await user.click(screen.getByRole('button', { name: label }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(saved).toEqual([])
    },
  )

  it('saves on a second press after a failure and drops the message', async () => {
    const user = userEvent.setup()
    let online = false
    fakeApi({ [ROUTE]: () => (online ? json(aBackup()) : offline()) })
    const { saved } = fakeSaves()
    render(<BackupDownload />)
    await user.click(screen.getByRole('button', { name: 'Download backup' }))
    await screen.findByRole('alert')

    online = true
    await user.click(screen.getByRole('button', { name: 'Download backup' }))

    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saved).toHaveLength(1)
  })
})
