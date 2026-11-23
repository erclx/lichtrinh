import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { groupPassword } from '@/features/accounts/password-groups'
import { PageHeader } from '@/shell/page-header'

interface PasswordOnceProps {
  title: string
  /** The display name of the person the password belongs to. */
  name: string
  password: string
  onDone: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * The only place a generated password is ever shown. It lives in the
 * caller's state alone, so Done, a reload, or leaving the page drops it.
 */
export function PasswordOnce({
  title,
  name,
  password,
  onDone,
}: PasswordOnceProps) {
  const { t } = useTranslation()
  const [copy, setCopy] = useState<CopyState>('idle')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const groups = groupPassword(password)
  // Letter by letter, since a reader guesses at a group read as a word.
  const spoken = groups.map((group) => group.split('').join(' ')).join(', ')

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col gap-4">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-center font-heading text-xl font-extrabold outline-none"
        >
          {t('accounts.sendTo', { name })}
        </h2>
        <p className="text-center text-base text-muted-foreground">
          {t('accounts.shownOnce', { name })}
        </p>
        <p className="flex flex-wrap justify-center gap-x-4 rounded-2xl bg-muted px-4 py-6 font-heading text-2xl font-extrabold tracking-wider">
          <span className="sr-only">
            {t('accounts.passwordLabel', { groups: spoken })}
          </span>
          {groups.map((group, index) => (
            // Two groups can hold the same letters, so the place joins the key.
            <span key={`${index}-${group}`} aria-hidden="true">
              {group}
            </span>
          ))}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          {t('accounts.alphabet')}
        </p>
        <Button onClick={() => void onCopy()} className="w-full">
          {t('accounts.copy')}
        </Button>
        <p role="status" className="min-h-[1lh] text-center text-sm">
          {copy === 'copied' && t('accounts.copied')}
          {copy === 'failed' && t('accounts.copyFailed')}
        </p>
        <Button variant="ghost" onClick={onDone} className="w-full bg-muted">
          {t('accounts.done')}
        </Button>
      </div>
    </>
  )
}
