import { CloudOffIcon } from 'lucide-react'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface SaveErrorProps {
  /** The sentence under the title, which says the typed work is kept. */
  message: string
  onRetry: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * The save error from `canon/design/states/`, drawn in foreground ink on the
 * card fill rather than the frame's pink, since a pastel names a kind alone.
 */
export function SaveError({ message, onRetry, ref }: SaveErrorProps) {
  const { t } = useTranslation()

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-xl border-2 border-foreground bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-center gap-3">
        <CloudOffIcon aria-hidden="true" className="size-7 shrink-0" />
        <p className="text-lg font-extrabold">{t('entries.notSavedTitle')}</p>
      </div>
      <p className="text-base">{message}</p>
      <Button type="button" onClick={onRetry} className="self-start">
        {t('entries.retrySave')}
      </Button>
    </div>
  )
}
