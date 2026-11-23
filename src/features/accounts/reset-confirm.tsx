import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface ResetConfirmProps {
  /** The display name of the account to reset, or null while closed. */
  name: string | null
  pending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Asks before a reset, since it ends every session the person holds. A sheet
 * from the bottom on phone and a centered dialog from tablet up.
 */
export function ResetConfirm({
  name,
  pending,
  error,
  onConfirm,
  onCancel,
}: ResetConfirmProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog.Root
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-foreground/40" />
        <AlertDialog.Popup className="fixed inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-2xl bg-popover p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-popover-foreground outline-none min-[480px]:inset-x-auto min-[480px]:top-1/2 min-[480px]:bottom-auto min-[480px]:left-1/2 min-[480px]:w-[440px] min-[480px]:-translate-x-1/2 min-[480px]:-translate-y-1/2 min-[480px]:rounded-2xl">
          <AlertDialog.Title className="font-heading text-xl font-extrabold">
            {t('accounts.confirmTitle', { name: name ?? '' })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-base text-muted-foreground">
            {t('accounts.confirmBody', { name: name ?? '' })}
          </AlertDialog.Description>
          {error !== null && (
            <p role="alert" className="rounded-xl bg-muted px-4 py-3 text-base">
              {error}
            </p>
          )}
          <Button onClick={onConfirm} aria-busy={pending} className="w-full">
            {t(pending ? 'accounts.resetting' : 'accounts.confirm')}
          </Button>
          <AlertDialog.Close
            render={
              <Button variant="ghost" className="w-full bg-muted">
                {t('accounts.cancel')}
              </Button>
            }
          />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
