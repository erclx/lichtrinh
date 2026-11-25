import type { Backup } from '@shared/backup.ts'
import { backup } from '@shared/backup.ts'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiFailure, apiFetch } from '@/lib/api'
import { DownloadIcon } from '@/shell/icons'

// Safari reads the file after the press returns, so its address outlives it.
const REVOKE_AFTER_MS = 60_000

function saveFile(name: string, saved: Backup) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = href
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS)
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saved'; file: string }
  | { kind: 'failed'; message: 'errors.network' | 'errors.generic' }

/** Saves every trip as one file, the family's copy outside the app. */
export function BackupDownload() {
  const { t } = useTranslation()
  const ids = useId()
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const pending = outcome.kind === 'pending'

  async function onDownload() {
    if (pending) return
    setOutcome({ kind: 'pending' })
    try {
      const saved = await apiFetch('/admin/backup', { schema: backup })
      const file = `lichtrinh-backup-${saved.exportedAt.slice(0, 10)}.json`
      saveFile(file, saved)
      setOutcome({ kind: 'saved', file })
    } catch (error) {
      const network = error instanceof ApiFailure && error.code === 'network'
      setOutcome({
        kind: 'failed',
        message: network ? 'errors.network' : 'errors.generic',
      })
    }
  }

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="mt-8 flex flex-col gap-3"
    >
      <h2 id={`${ids}-title`} className="text-lg font-extrabold">
        {t('backup.title')}
      </h2>
      <p className="text-base text-muted-foreground">{t('backup.lead')}</p>
      {/* Above the button, since the phone tab bar covers what appears below. */}
      {outcome.kind === 'saved' && (
        <p
          role="status"
          className="rounded-xl bg-muted px-4 py-3 text-base break-words"
        >
          {t('backup.saved', { file: outcome.file })}
        </p>
      )}
      {outcome.kind === 'failed' && (
        <p role="alert" className="rounded-xl bg-muted px-4 py-3 text-base">
          {t(outcome.message)}
        </p>
      )}
      <Button
        variant="ghost"
        onClick={() => void onDownload()}
        aria-busy={pending}
        className="w-full bg-muted"
      >
        <DownloadIcon />
        {t(pending ? 'backup.downloading' : 'backup.download')}
      </Button>
    </section>
  )
}
