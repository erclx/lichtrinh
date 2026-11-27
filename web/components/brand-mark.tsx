import type { ComponentProps } from 'react'

/** The app's mark. Its outline and rings take `currentColor`, and its page and band take the card and rest fills, so it follows the app's own theme. */
export function BrandMark(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <rect
        x="8"
        y="12"
        width="48"
        height="46"
        rx="14"
        className="fill-card"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M10 27h44v-3a10 10 0 0 0-10-10H20a10 10 0 0 0-10 10z"
        className="fill-rest"
      />
      <path d="M8 27h48" stroke="currentColor" strokeWidth="4" />
      <rect x="19.5" y="5" width="6" height="14" rx="3" fill="currentColor" />
      <rect x="38.5" y="5" width="6" height="14" rx="3" fill="currentColor" />
      <rect
        x="15"
        y="32"
        width="34"
        height="5.4"
        rx="2.7"
        fill="#ffd9bf"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="40"
        width="26"
        height="5.4"
        rx="2.7"
        fill="#ffcfe1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="48"
        width="30"
        height="5.4"
        rx="2.7"
        fill="#c9f1dd"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}
