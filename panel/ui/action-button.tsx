import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { PlayIcon } from './icons.tsx'

interface ActionButtonProps extends ComponentProps<typeof Button> {
  /** The next step, drawn filled. */
  primary?: boolean
  /** The play mark, which a primary press that starts nothing leaves out. */
  mark?: boolean
}

/**
 * The kit's pill at the panel's weight. It keeps its focus while disabled, so
 * a keyboard press on Start stays on the button through the start.
 */
export function ActionButton({
  primary = false,
  mark = primary,
  className,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <Button
      variant={primary ? 'default' : 'outline'}
      focusableWhenDisabled
      className={cn(
        'gap-2.5 border-2 px-6.5 data-disabled:pointer-events-none data-disabled:opacity-50',
        primary
          ? 'bg-clip-border'
          : 'bg-card hover:bg-muted dark:border-border dark:bg-card dark:hover:bg-muted',
        className,
      )}
      {...props}
    >
      {mark && <PlayIcon />}
      {children}
    </Button>
  )
}
