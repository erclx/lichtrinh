import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ShareIcon } from '@/shell/icons'
import { PageHeader } from '@/shell/page-header'

import { useInstalled, useInstallPrompt } from './platform'

interface StepCardProps {
  number: number
  title: string
  detail: string
  /** What to look for on the phone, left out where the words are enough. */
  picture?: ReactNode
}

function StepCard({ number, title, detail, picture }: StepCardProps) {
  return (
    <li className="flex items-start gap-3.5 rounded-xl border-[1.5px] border-border bg-card p-4 text-muted-foreground">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-black text-primary-foreground">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold">{title}</p>
        <p className="text-sm">{detail}</p>
      </div>
      {picture}
    </li>
  )
}

/** Walks an iPhone through Safari, and offers the prompt a browser holds. */
export function HomeScreenPage() {
  const { t } = useTranslation()
  const installed = useInstalled()
  const install = useInstallPrompt()

  return (
    <>
      <PageHeader title={t('install.title')} backTo="/settings" />
      {installed ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          {t('install.done')}
        </p>
      ) : (
        <>
          {install !== null && (
            <Button className="mb-4" onClick={install}>
              {t('install.button')}
            </Button>
          )}
          <p className="mb-3 text-sm text-muted-foreground">
            {t('install.lead')}
          </p>
          <ol className="flex flex-col gap-2.5">
            <StepCard
              number={1}
              title={t('install.shareTitle')}
              detail={t('install.shareDetail')}
              picture={
                <ShareIcon className="size-6.5 shrink-0 text-foreground" />
              }
            />
            <StepCard
              number={2}
              title={t('install.chooseTitle')}
              detail={t('install.chooseDetail')}
            />
            <StepCard
              number={3}
              title={t('install.addTitle')}
              detail={t('install.addDetail')}
              picture={
                <img
                  src="/icon-180x180.png"
                  alt=""
                  className="size-14 shrink-0 rounded-md ring-1 ring-border"
                />
              }
            />
          </ol>
        </>
      )}
    </>
  )
}
