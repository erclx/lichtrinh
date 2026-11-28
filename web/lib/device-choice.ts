import { useState } from 'react'

const keyOf = (name: string) => `lichtrinh.${name}`

// Reaching `localStorage` at all throws in some private modes, so the default
// is resolved inside each guard rather than as a parameter default.
/** The choice this device remembers under `name`, or `fallback` when none valid is stored. */
export function readChoice<T extends string>(
  name: string,
  options: readonly T[],
  fallback: T,
  storage?: Storage,
): T {
  try {
    const value = (storage ?? localStorage).getItem(keyOf(name))
    return options.find((option) => option === value) ?? fallback
  } catch {
    return fallback
  }
}

export function storeChoice(name: string, value: string, storage?: Storage) {
  try {
    ;(storage ?? localStorage).setItem(keyOf(name), value)
  } catch {
    // An unremembered choice still applies for this visit.
  }
}

/**
 * A choice this device remembers, reading `fallback` until one is made, so a
 * default that follows the screen width keeps following it until then.
 */
export function useDeviceChoice<T extends string>(
  name: string,
  options: readonly T[],
  fallback: T,
) {
  const [picked, setPicked] = useState<T | null>(null)
  const choice = picked ?? readChoice(name, options, fallback)
  const choose = (next: T) => {
    storeChoice(name, next)
    setPicked(next)
  }
  return [choice, choose] as const
}
