import type { TurnStep } from '@shared/chats.ts'
import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { stepText } from '@/features/chat/step-text'
import { useLanguage } from '@/i18n/use-language'

/**
 * One thing the assistant did. The API sends a step once its write landed,
 * so every line reads as done and the thinking line carries the wait.
 */
export function StepLine({ step }: { step: TurnStep }) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
      <CheckIcon
        aria-hidden="true"
        className="mt-1 size-5 shrink-0 text-foreground"
        strokeWidth={3}
      />
      <span>{stepText(step, t, language)}</span>
    </li>
  )
}
