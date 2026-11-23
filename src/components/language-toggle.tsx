import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Language } from '@/i18n/resources'
import { chooseLanguage } from '@/i18n/setup'
import { cn } from '@/lib/utils'

const options = [
  { language: 'vi', code: 'language.vi', name: 'language.viName' },
  { language: 'en', code: 'language.en', name: 'language.enName' },
] as const

/**
 * Each button's label leads with its visible code, so a voice user saying VI
 * reaches it. A hidden child span would lose the space between code and name.
 */
interface LanguageToggleProps {
  className?: string
  /** Called after a press, so a signed-in screen can save the account's language. */
  onChange?: (language: Language) => void
}

export function LanguageToggle({ className, onChange }: LanguageToggleProps) {
  const { t, i18n } = useTranslation()

  return (
    <div
      role="group"
      aria-label={t('language.groupLabel')}
      className={cn('flex rounded-full bg-muted p-1', className)}
    >
      {options.map(({ language, code, name }) => (
        <Button
          key={language}
          variant="ghost"
          lang={language}
          aria-pressed={i18n.language === language}
          aria-label={`${t(code)} ${t(name)}`}
          onClick={async () => {
            await chooseLanguage(language)
            onChange?.(language)
          }}
          className="min-w-16 px-4 text-lg text-muted-foreground hover:bg-transparent not-aria-pressed:hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground dark:hover:bg-transparent"
        >
          {t(code)}
        </Button>
      ))}
    </div>
  )
}
