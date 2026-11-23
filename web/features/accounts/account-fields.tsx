import type { Language, Role } from '@shared/auth.ts'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DisplayNameError } from '@/features/accounts/display-name'

const labelClass = 'text-sm leading-none font-extrabold'

interface DisplayNameFieldProps {
  idPrefix: string
  value: string
  error: DisplayNameError | undefined
  inputRef: Ref<HTMLInputElement>
  onChange: (value: string) => void
}

export function DisplayNameField({
  idPrefix,
  value,
  error,
  inputRef,
  onChange,
}: DisplayNameFieldProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-name`}>{t('accounts.displayName')}</Label>
      <Input
        ref={inputRef}
        id={`${idPrefix}-name`}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={
          error !== undefined ? `${idPrefix}-name-error` : undefined
        }
      />
      {error !== undefined && (
        <p id={`${idPrefix}-name-error`} className="text-sm">
          {t(
            error === 'tooLong'
              ? 'accounts.displayNameTooLong'
              : 'accounts.displayNameRequired',
          )}
        </p>
      )}
    </div>
  )
}

interface AccountChoicesProps {
  idPrefix: string
  role: Role
  canChat: boolean
  language: Language
  onRole: (role: Role) => void
  onCanChat: (canChat: boolean) => void
  onLanguage: (language: Language) => void
  /** Shows the role as text, for the admin's own account. */
  roleFixed?: boolean
  roleError?: string | null
}

/** The role, chat, and language groups an account is created and edited with. */
export function AccountChoices({
  idPrefix,
  role,
  canChat,
  language,
  onRole,
  onCanChat,
  onLanguage,
  roleFixed = false,
  roleError = null,
}: AccountChoicesProps) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex flex-col gap-2">
        <p id={`${idPrefix}-role`} className={labelClass}>
          {t('accounts.role')}
        </p>
        {roleFixed ? (
          <p className="text-base">
            {t(role === 'admin' ? 'accounts.roleAdmin' : 'accounts.roleMember')}
            <span className="block text-sm text-muted-foreground">
              {t('accounts.ownRole')}
            </span>
          </p>
        ) : (
          <ToggleGroup
            aria-labelledby={`${idPrefix}-role`}
            aria-describedby={
              roleError !== null ? `${idPrefix}-role-error` : undefined
            }
            value={[role]}
            onValueChange={([next]) => {
              if (next === 'member' || next === 'admin') onRole(next)
            }}
          >
            <ToggleGroupItem value="member">
              {t('accounts.roleMember')}
            </ToggleGroupItem>
            <ToggleGroupItem value="admin">
              {t('accounts.roleAdmin')}
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {roleError !== null && (
          <p id={`${idPrefix}-role-error`} role="alert" className="text-sm">
            {roleError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p id={`${idPrefix}-chat`} className={labelClass}>
          {t('accounts.canChatLabel')}
        </p>
        <ToggleGroup
          aria-labelledby={`${idPrefix}-chat`}
          aria-describedby={`${idPrefix}-chat-hint`}
          value={[canChat ? 'on' : 'off']}
          onValueChange={([next]) => {
            if (next === 'on' || next === 'off') onCanChat(next === 'on')
          }}
        >
          <ToggleGroupItem value="on">{t('accounts.on')}</ToggleGroupItem>
          <ToggleGroupItem value="off">{t('accounts.off')}</ToggleGroupItem>
        </ToggleGroup>
        <p
          id={`${idPrefix}-chat-hint`}
          className="text-center text-sm text-muted-foreground"
        >
          {t('accounts.canChatHint')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p id={`${idPrefix}-language`} className={labelClass}>
          {t('accounts.language')}
        </p>
        <ToggleGroup
          aria-labelledby={`${idPrefix}-language`}
          value={[language]}
          onValueChange={([next]) => {
            if (next === 'vi' || next === 'en') onLanguage(next)
          }}
        >
          <ToggleGroupItem value="vi" lang="vi">
            {t('language.viName')}
          </ToggleGroupItem>
          <ToggleGroupItem value="en" lang="en">
            {t('language.enName')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </>
  )
}
