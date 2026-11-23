import type { EntryKind } from '@shared/changes.ts'
import type { ComponentProps, ComponentType } from 'react'

type IconProps = ComponentProps<'svg'>

// Drawn at stroke 2 as the entry frames draw them, a touch lighter than the
// shell's control icons since they sit on a pastel tile.
function KindIcon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

function FoodIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z" />
      <path d="M8.5 7.5c0-1.6 1.2-1.6 1.2-3.3M12.3 7.5c0-1.6 1.2-1.6 1.2-3.3M16 7.5c0-1.6 1.2-1.6 1.2-3.3" />
    </KindIcon>
  )
}

function SightsIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <circle cx="12" cy="6.5" r="2.8" />
      <circle cx="16.8" cy="10" r="2.8" />
      <circle cx="15" cy="15.4" r="2.8" />
      <circle cx="9" cy="15.4" r="2.8" />
      <circle cx="7.2" cy="10" r="2.8" />
      <circle cx="12" cy="11.2" r="1.6" fill="currentColor" />
    </KindIcon>
  )
}

function RestIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <path d="M3 19v-9M3 15h18v4M21 15v-2.5a3 3 0 0 0-3-3h-7.5V15" />
      <circle cx="6.8" cy="12" r="1.9" />
    </KindIcon>
  )
}

function TransportIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <path d="M4.5 16.5h15v-4.2l-2.2-5.3H6.7l-2.2 5.3z" />
      <path d="M4.5 12.3h15" />
      <circle cx="8" cy="17.5" r="1.7" />
      <circle cx="16" cy="17.5" r="1.7" />
    </KindIcon>
  )
}

function ActivityIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <path d="M3 15.5h18l-3.2 4.5H6.2z" />
      <path d="M12 15.5V4l6.5 9.5H12" />
    </KindIcon>
  )
}

function NoKindIcon(props: IconProps) {
  return (
    <KindIcon {...props}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </KindIcon>
  )
}

const icons: Record<EntryKind, ComponentType<IconProps>> = {
  food: FoodIcon,
  sights: SightsIcon,
  rest: RestIcon,
  transport: TransportIcon,
  activity: ActivityIcon,
}

/** A kind's drawn icon, or a plain dot for an entry of no kind. */
export function KindGlyph({
  kind,
  ...props
}: IconProps & { kind: EntryKind | null }) {
  const Glyph = kind === null ? NoKindIcon : icons[kind]
  return <Glyph {...props} />
}
