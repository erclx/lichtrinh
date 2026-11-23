import { useTranslation } from 'react-i18next'

import { BrandMark } from '@/components/brand-mark'
import { LanguageToggle } from '@/components/language-toggle'

export function App() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center gap-2.5 px-4 py-2.5">
        <BrandMark className="size-[34px] shrink-0" />
        <span className="font-heading text-lg font-extrabold">
          {t('app.name')}
        </span>
        <LanguageToggle className="ml-auto" />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <h1 className="font-heading text-2xl font-extrabold">
          {t('app.name')}
        </h1>
      </main>
    </div>
  )
}
