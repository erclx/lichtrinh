import type { DialogPopupProps } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

interface PickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Set on the title, so a group inside can name itself by it. */
  titleId: string
  initialFocus?: DialogPopupProps['initialFocus']
  finalFocus?: DialogPopupProps['finalFocus']
  children: ReactNode
}

const closeClass =
  'relative flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-foreground outline-none after:absolute after:-inset-1 focus-visible:ring-3 focus-visible:ring-ring [@media(hover:hover)]:hover:bg-border'

const titleClass = 'min-w-0 text-xl font-black'

/**
 * The container every picker opens in, a bottom sheet under 480px and a
 * centered dialog from 480px up, under one title and close control.
 */
export function PickerSheet({
  open,
  onOpenChange,
  title,
  titleId,
  initialFocus,
  finalFocus,
  children,
}: PickerSheetProps) {
  const { t } = useTranslation()
  const isDialog = useMediaQuery('(min-width: 480px)')
  const closeIcon = (
    <XIcon aria-hidden="true" className="size-6" strokeWidth={2.6} />
  )

  if (isDialog) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className="flex max-h-[85dvh] w-[440px] max-w-[calc(100%-2rem)] flex-col gap-0 p-4 pt-5 sm:max-w-[440px]"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-2 pb-2.5">
            <DialogTitle id={titleId} className={titleClass}>
              {title}
            </DialogTitle>
            <DialogClose
              aria-label={t('controls.close')}
              className={closeClass}
            >
              {closeIcon}
            </DialogClose>
          </div>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent
        initialFocus={initialFocus}
        finalFocus={finalFocus}
        className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-2 pt-1 pb-2.5">
          <DrawerTitle id={titleId} className={titleClass}>
            {title}
          </DrawerTitle>
          <DrawerClose aria-label={t('controls.close')} className={closeClass}>
            {closeIcon}
          </DrawerClose>
        </div>
        {children}
      </DrawerContent>
    </Drawer>
  )
}
