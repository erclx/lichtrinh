import { useEffect } from 'react'

const holds = new Set<symbol>()

/** Holds the page on this release until the returned release is called. */
export function hold(): () => void {
  const key = Symbol('hold')
  holds.add(key)
  return () => {
    holds.delete(key)
  }
}

/**
 * Holds the page while `active`, for something a reload would lose that no
 * field on screen shows, such as a recording or a password shown once.
 */
export function useHold(active: boolean) {
  useEffect(() => (active ? hold() : undefined), [active])
}

const safeAttribute = 'data-safe-when-empty'

/**
 * Spread on a form whose fields alone carry what it would lose, so it holds
 * only while one of them holds text. Every other form holds while on screen,
 * since its picks show in no field.
 */
export const safeWhenEmpty = { [safeAttribute]: '' } as const

function holdsText(field: Element): boolean {
  if (field instanceof HTMLTextAreaElement) return field.value !== ''
  if (!(field instanceof HTMLInputElement)) return false
  return field.type !== 'hidden' && field.value !== ''
}

function formHolds(form: HTMLFormElement): boolean {
  if (!form.hasAttribute(safeAttribute)) return true
  return Array.from(form.elements).some(holdsText)
}

/** Whether a reload now would lose something on this page. */
export function isHeld(): boolean {
  if (holds.size > 0) return true
  return Array.from(document.querySelectorAll('form')).some(formHolds)
}
