import type { ComponentProps } from 'react'

import type { ServiceId } from '../services.ts'

/** A stroked icon in the weight `canon/design/panel` draws. */
function Icon(props: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6"
      {...props}
    />
  )
}

export function PlayIcon() {
  return (
    <Icon className="size-5.5">
      <path d="M8 5.5v13l10-6.5z" />
    </Icon>
  )
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  )
}

export function ServiceIcon({ id }: { id: ServiceId }) {
  switch (id) {
    case 'voice':
      return (
        <Icon>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </Icon>
      )
    case 'model':
      return (
        <Icon>
          <rect x="6" y="6" width="12" height="12" rx="3" />
          <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
        </Icon>
      )
    case 'bridge':
      return (
        <Icon>
          <path d="M3 17h18M3 17V9M21 17V9M3 9c3 5 15 5 18 0M8 17v-4.5M12 17v-4M16 17v-4.5" />
        </Icon>
      )
    case 'staging':
      return (
        <Icon>
          <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9" />
        </Icon>
      )
  }
}
