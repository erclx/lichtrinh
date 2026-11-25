import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface RemoveTripSheetProps {
  name: string
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

/**
 * Asks before an undo that removes the whole trip, since no page lists a
 * removed trip and its Undo status is the one way back.
 */
export function RemoveTripSheet({
  name,
  open,
  onClose,
  onConfirm,
}: RemoveTripSheetProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/40" />
        <AlertDialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-2xl bg-popover p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-popover-foreground outline-none min-[480px]:inset-x-auto min-[480px]:top-1/2 min-[480px]:bottom-auto min-[480px]:left-1/2 min-[480px]:w-[440px] min-[480px]:-translate-x-1/2 min-[480px]:-translate-y-1/2 min-[480px]:rounded-2xl">
          <AlertDialog.Title className="font-heading text-xl font-extrabold break-words">
            {t('history.removeTripTitle', { title: name })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-base text-muted-foreground">
            {t('history.removeTripBody')}
          </AlertDialog.Description>
          <Button onClick={onConfirm} className="w-full">
            {t('history.removeTrip')}
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
