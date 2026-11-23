export const appearances = ['auto', 'light', 'dark'] as const

export type Appearance = (typeof appearances)[number]

type Theme = 'light' | 'dark'

// The head script in index.html reads this key and these three values before
// the first paint, and cannot import this module, so the two must agree.
const storageKey = 'lichtrinh.theme'

export function isAppearance(value: unknown): value is Appearance {
  return appearances.some((appearance) => appearance === value)
}

export function resolveTheme(
  appearance: Appearance,
  deviceDark: boolean,
): Theme {
  if (appearance === 'auto') return deviceDark ? 'dark' : 'light'
  return appearance
}

// Reaching `localStorage` at all throws in some private modes, so the default
// is resolved inside each guard rather than as a parameter default.
export function readAppearance(storage?: Storage): Appearance {
  try {
    const value = (storage ?? localStorage).getItem(storageKey)
    return isAppearance(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function storeAppearance(appearance: Appearance, storage?: Storage) {
  try {
    ;(storage ?? localStorage).setItem(storageKey, appearance)
  } catch {
    // An unremembered choice still applies for this visit.
  }
}

function deviceIsDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/**
 * Remembers a person's pick and themes the page at once. The head script's
 * scheme listener rereads the stored pick, so Auto resumes following the
 * device and a forced theme survives a scheme flip.
 */
export function chooseAppearance(appearance: Appearance, storage?: Storage) {
  storeAppearance(appearance, storage)
  document.documentElement.dataset.theme = resolveTheme(
    appearance,
    deviceIsDark(),
  )
}
