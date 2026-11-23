import { XIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUndo } from '@/calendar-data/mutations'
import { type OfferUndo, OfferUndoContext } from '@/components/undo-context'
import { ApiFailure } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useOnline } from '@/offline/connection'

interface Notice {
  /** What changed, already worded, such as `Deleted “Lunch”`. */
  message: string
  /** The change Undo reverses, or null once there is nothing to undo. */
  changeId: string | null
  /** Generated once per notice, so a retried undo answers the stored one. */
  undoId: string
  /** Bumped on every new notice, so the timer restarts for it. */
  serial: number
}

const showMs = 6_000

/**
 * Holds the one status naming the last change with its Undo, above the
 * routes, so it stays up when a save or a delete moves to another page.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)

  const offer = useCallback<OfferUndo>((message, changeId) => {
    setNotice((current) => ({
      message,
      changeId,
      undoId: crypto.randomUUID(),
      serial: (current?.serial ?? 0) + 1,
    }))
  }, [])

  return (
    <OfferUndoContext value={offer}>
      {children}
      <UndoStatus notice={notice} onChange={setNotice} />
    </OfferUndoContext>
  )
}

interface UndoStatusProps {
  notice: Notice | null
  onChange: (next: Notice | null) => void
}

function undoFailureKey(error: unknown) {
  if (!(error instanceof ApiFailure)) return 'errors.generic' as const
  if (error.code === 'undo_conflict') return 'undo.conflict' as const
  if (error.code === 'already_undone') return 'undo.alreadyUndone' as const
  if (error.code === 'network') return 'errors.network' as const
  return 'errors.generic' as const
}

/**
 * The status itself. It hides after six seconds, waits while a pointer rests
 * on it or focus sits inside it, and never takes focus, so it interrupts no
 * typing.
 */
function UndoStatus({ notice, onChange }: UndoStatusProps) {
  const { t } = useTranslation()
  const undo = useUndo()
  const online = useOnline()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const held = hovered || focused || undo.isPending

  useEffect(() => {
    if (notice === null || held) return
    const timer = setTimeout(() => onChange(null), showMs)
    return () => clearTimeout(timer)
  }, [notice, held, onChange])

  // Offline the Undo stays, saying it waits, so it still works once back.
  function undoLabel() {
    if (!online) return t('offline.needsConnection')
    return undo.isPending ? t('undo.undoing') : t('undo.undo')
  }

  function runUndo() {
    if (notice === null || notice.changeId === null || !online) return
    const { changeId, undoId } = notice
    undo.mutate(
      { changeId, undoId },
      {
        onSuccess: () =>
          onChange({ ...notice, message: t('undo.undone'), changeId: null }),
        onError: (error) =>
          onChange({
            ...notice,
            message: t(undoFailureKey(error)),
            // A lost answer can be asked again under the same undo id.
            changeId:
              error instanceof ApiFailure && error.code === 'network'
                ? changeId
                : null,
          }),
      },
    )
  }

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-40 flex justify-center min-[480px]:inset-x-auto min-[480px]:right-6 min-[480px]:bottom-6"
    >
      {notice !== null && (
        <div
          key={notice.serial}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="pointer-events-auto flex w-full max-w-[440px] items-center gap-2 rounded-xl bg-primary py-2 pr-2 pl-5 text-base font-bold text-primary-foreground shadow-lg"
        >
          <span className="min-w-0 flex-1 break-words">{notice.message}</span>
          {notice.changeId !== null && (
            <button
              type="button"
              onClick={runUndo}
              aria-disabled={undo.isPending || !online}
              className={cn(
                'inline-flex min-h-target shrink-0 items-center rounded-lg bg-background px-4 font-extrabold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary-foreground',
                !online && 'cursor-not-allowed',
              )}
            >
              {undoLabel()}
            </button>
          )}
          <button
            type="button"
            aria-label={t('undo.dismiss')}
            onClick={() => onChange(null)}
            className="inline-flex size-target shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-primary-foreground"
          >
            <XIcon aria-hidden="true" className="size-6" strokeWidth={2.6} />
          </button>
        </div>
      )}
    </div>
  )
}
