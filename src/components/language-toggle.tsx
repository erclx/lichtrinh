import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { changeLanguage } from '@/i18n/setup'
import { cn } from '@/lib/utils'

const options = [
  { language: 'vi', code: 'language.vi', name: 'language.viName' },
  { language: 'en', code: 'language.en', name: 'language.enName' },
] as const

export function LanguageToggle({ className }: { className?: string }) {
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
          // The visible code leads the spoken name, so a voice user saying VI
          // reaches the button. A hidden child span loses the space between them.
          aria-label={`${t(code)} ${t(name)}`}
          onClick={() => void changeLanguage(language)}
          className="min-w-16 px-4 text-lg text-muted-foreground hover:bg-transparent not-aria-pressed:hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground dark:hover:bg-transparent"
        >
          {t(code)}
        </Button>
      ))}
    </div>
  )
}
