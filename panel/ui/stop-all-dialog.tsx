import { useRef } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import { ActionButton } from './action-button.tsx'

interface StopAllDialogProps {
  open: boolean
  warning: string
  onClose: () => void
  onConfirm: () => void
}

/** The confirm in front of Stop all, opening on the answer that stops nothing. */
export function StopAllDialog({
  open,
  warning,
  onClose,
  onConfirm,
}: StopAllDialogProps) {
  const keep = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        initialFocus={keep}
        className="gap-2 bg-card p-6 sm:max-w-110"
      >
        <DialogTitle className="text-xl font-black">
          Stop everything on this PC?
        </DialogTitle>
        <DialogDescription className="text-base">{warning}</DialogDescription>
        <div className="flex gap-2 pt-2.5 max-[599px]:flex-col">
          <ActionButton
            ref={keep}
            onClick={onClose}
            className="flex-1 px-3.5 max-[599px]:flex-none"
          >
            Keep running
          </ActionButton>
          <ActionButton
            primary
            mark={false}
            onClick={onConfirm}
            className="flex-1 px-3.5 max-[599px]:flex-none"
          >
            Stop all
          </ActionButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
