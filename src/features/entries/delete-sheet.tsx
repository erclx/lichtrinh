import { AlertDialog } from '@base-ui/react/alert-dialog'
import type { Entry } from '@shared/entries.ts'
import { useTranslation } from 'react-i18next'

import { useDeleteEntry } from '@/calendar-data/mutations'
import { Button } from '@/components/ui/button'
import { useOfferUndo } from '@/components/undo-context'
import { ApiFailure } from '@/lib/api'

interface DeleteSheetProps {
  /** The entry to delete, or null while the sheet is closed. */
  entry: Entry | null
  onClose: () => void
  /** Called once the delete holds, after Undo is offered. */
  onDeleted?: () => void
}

function failureKey(error: unknown) {
  return error instanceof ApiFailure && error.code === 'network'
    ? 'errors.network'
    : 'errors.generic'
}

/**
 * The plain confirmation from `canon/design/entry/delete`, opened by the
 * entry's own Delete and by the day list's swiped Delete alike. The confirm
 * takes the foreground ink, so it reads by its label rather than by red.
 */
export function DeleteSheet({ entry, onClose, onDeleted }: DeleteSheetProps) {
  const { t } = useTranslation()
  const offerUndo = useOfferUndo()
  const remove = useDeleteEntry()

  function onConfirm() {
    if (entry === null || remove.isPending) return
    remove.mutate(
      { id: entry.id, version: entry.version },
      {
        onSuccess: ({ changeId }) => {
          offerUndo(t('undo.deleted', { title: entry.title }), changeId)
          onClose()
          onDeleted?.()
        },
      },
    )
  }

  return (
    <AlertDialog.Root
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset()
          onClose()
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40" />
        <AlertDialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-2xl bg-popover p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-popover-foreground outline-none min-[480px]:inset-x-auto min-[480px]:top-1/2 min-[480px]:bottom-auto min-[480px]:left-1/2 min-[480px]:w-[440px] min-[480px]:-translate-x-1/2 min-[480px]:-translate-y-1/2 min-[480px]:rounded-2xl">
          <AlertDialog.Title className="font-heading text-xl font-extrabold break-words">
            {t('entries.deleteTitle', { title: entry?.title ?? '' })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-base text-muted-foreground">
            {t('entries.deleteBody')}
          </AlertDialog.Description>
          {remove.isError && (
            <p role="alert" className="rounded-xl bg-muted px-4 py-3 text-base">
              {t(failureKey(remove.error))}
            </p>
          )}
          <Button
            onClick={onConfirm}
            aria-busy={remove.isPending}
            className="w-full"
          >
            {remove.isPending ? t('entries.deleting') : t('entries.delete')}
          </Button>
          <AlertDialog.Close
            render={
              <Button variant="ghost" className="w-full bg-muted">
                {t('entries.keep')}
              </Button>
            }
          />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
