import { Trash2Icon } from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

interface SwipeRowProps {
  children: ReactNode
  onDelete: () => void
}

// The Delete button's width plus its gap, read from the prototype. The
// button's `-right-26` class sits it this far past the row's edge.
const revealWidth = 104
// A drag claims the row only past this many pixels and further sideways than
// down, so the day's vertical scroll keeps every other drag.
const claimDistance = 10

interface Drag {
  x: number
  y: number
  from: number
  claimed: boolean
}

/**
 * Wraps a day-list row under 1024px so a left drag reveals Delete. It is never
 * the only route to deleting, so the caller keeps a Delete reachable without it.
 */
export function SwipeRow({ children, onDelete }: SwipeRowProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  if (isDesktop) return children
  return <SwipeArea onDelete={onDelete}>{children}</SwipeArea>
}

function SwipeArea({ children, onDelete }: SwipeRowProps) {
  const { t } = useTranslation()
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  // The click a browser fires at the end of a drag must not open the row.
  const swipedRef = useRef(false)
  const open = offset === -revealWidth && !dragging

  useEffect(() => {
    if (!open) return
    function closeOnOutsidePress(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOffset(0)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress, true)
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePress, true)
  }, [open])

  function onPointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    if ((event.target as Element).closest('[data-swipe-delete]')) return
    swipedRef.current = false
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      from: offset,
      claimed: false,
    }
  }

  function onPointerMove(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.claimed) {
      if (Math.abs(dy) >= claimDistance && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null
        return
      }
      if (Math.abs(dx) < claimDistance || Math.abs(dx) < Math.abs(dy)) return
      drag.claimed = true
      setDragging(true)
    }
    setOffset(Math.max(-revealWidth, Math.min(0, drag.from + dx)))
  }

  function endDrag() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.claimed) return
    swipedRef.current = true
    setDragging(false)
    setOffset((current) => (current < -revealWidth / 2 ? -revealWidth : 0))
  }

  function onClickCapture(event: MouseEvent) {
    if (!swipedRef.current && !open) return
    event.preventDefault()
    event.stopPropagation()
    if (!swipedRef.current) setOffset(0)
    swipedRef.current = false
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) setOffset(0)
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className="relative touch-pan-y overflow-x-clip"
    >
      <div
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          'relative',
          !dragging &&
            'motion-safe:transition-transform motion-safe:duration-180 motion-safe:ease-out',
        )}
      >
        <div onClickCapture={onClickCapture}>{children}</div>
        {offset < 0 && (
          <button
            type="button"
            data-swipe-delete=""
            onClick={onDelete}
            className="absolute inset-y-1.5 -right-26 flex min-h-target w-24 flex-col items-center justify-center gap-0.5 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Trash2Icon
              aria-hidden="true"
              className="size-6"
              strokeWidth={2.2}
            />
            {t('controls.delete')}
          </button>
        )}
      </div>
    </div>
  )
}
