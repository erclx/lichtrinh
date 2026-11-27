import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { type Appearance, chooseAppearance, readAppearance } from './appearance'

const options = [
  { appearance: 'auto', label: 'settings.appearanceAuto' },
  { appearance: 'light', label: 'settings.appearanceLight' },
  { appearance: 'dark', label: 'settings.appearanceDark' },
] as const satisfies readonly { appearance: Appearance; label: string }[]

/** Drawn like the Language toggle, so the two rows read as one kind of control. */
export function AppearanceToggle() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(readAppearance)

  return (
    <div
      role="group"
      aria-label={t('settings.appearance')}
      className="flex rounded-[calc(var(--radius)+var(--spacing))] bg-muted p-1"
    >
      {options.map(({ appearance, label }) => (
        <Button
          key={appearance}
          variant="ghost"
          aria-pressed={current === appearance}
          onClick={() => {
            chooseAppearance(appearance)
            setCurrent(appearance)
          }}
          className="min-w-16 px-4 text-lg text-muted-foreground hover:bg-transparent not-aria-pressed:hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary dark:hover:bg-transparent"
        >
          {t(label)}
        </Button>
      ))}
    </div>
  )
}
