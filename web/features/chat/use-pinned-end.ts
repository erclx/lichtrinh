import { useEffect, useRef } from 'react'

/** About one short row, so a bounce or a rounding error never unpins and a deliberate scroll does. */
const pinnedWithin = 64

interface PinnedEndOptions {
  /** True when the thread scrolls inside itself, false when the window scrolls it. */
  scrollsItself: boolean
  /** While live words cover the thread, the end waits and is reached once they clear. */
  covered: boolean
}

/**
 * Keeps the thread at its true end through any change of size, unless the
 * reader scrolled up, read from scrolling alone since a layout change says
 * nothing about where the reader wants to be.
 */
export function usePinnedEnd({ scrollsItself, covered }: PinnedEndOptions) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const coveredNow = useRef(covered)
  const toEnd = useRef<() => void>(() => undefined)

  useEffect(() => {
    const box = scrollsItself ? scroller.current : null
    if (scrollsItself && box === null) return
    const read = () =>
      box === null
        ? {
            top: scrollY,
            height: document.documentElement.scrollHeight,
            view: innerHeight,
          }
        : {
            top: box.scrollTop,
            height: box.scrollHeight,
            view: box.clientHeight,
          }
    // Content can grow before this hook's own scroll event, so that event is skipped.
    let landed: number | null = null

    toEnd.current = () => {
      const { height } = read()
      ;(box ?? window).scrollTo({ top: height, behavior: 'instant' })
      landed = read().top
    }

    function onScroll() {
      const { top, height, view } = read()
      if (landed !== null && Math.abs(top - landed) < 1) return
      landed = null
      pinned.current = height - top - view <= pinnedWithin
    }

    function follow() {
      if (pinned.current && !coveredNow.current) toEnd.current()
    }

    const target = box ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', follow)
    // The test DOM has no ResizeObserver, nor a scrollTo to call.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow)
    for (const element of [box, content.current, foot.current]) {
      if (element !== null) observer?.observe(element)
    }
    return () => {
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', follow)
      observer?.disconnect()
      toEnd.current = () => undefined
    }
  }, [scrollsItself])

  useEffect(() => {
    coveredNow.current = covered
    if (!covered && pinned.current && typeof ResizeObserver !== 'undefined') {
      toEnd.current()
    }
  }, [covered])

  return { scroller, content, foot }
}
