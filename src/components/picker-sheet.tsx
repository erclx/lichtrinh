import type { DialogPopupProps } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, type Ref, useId } from 'react'
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
import { cn } from '@/lib/utils'

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

interface PickerFieldProps {
  label: string
  /** The chosen value's text, or empty when nothing is chosen yet. */
  value: string
  /** Shown muted in place of an empty value. */
  placeholder?: string
  icon: ReactNode
  expanded: boolean
  onOpen: () => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * The closed field a picker opens from, named by its label and value. It
 * opens on a press, and on Up or Down Arrow as a combobox does.
 */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  expanded,
  onOpen,
  ref,
}: PickerFieldProps) {
  const labelId = useId()
  const valueId = useId()

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="text-sm font-extrabold">
        {label}
      </span>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className="flex h-target w-full min-w-0 items-center justify-between gap-2 rounded-lg border-2 border-input bg-card px-4 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-expanded:border-ring aria-expanded:ring-2 aria-expanded:ring-ring"
      >
        <span
          id={valueId}
          className={cn('min-w-0 truncate', !value && 'text-muted-foreground')}
        >
          {value || placeholder}
        </span>
        <span className="flex shrink-0 text-muted-foreground">{icon}</span>
      </button>
    </div>
  )
}
