import type { StepKind, TurnStep } from '@shared/chats.ts'
import type { TFunction } from 'i18next'

import { formatCardDate, formatTime } from '@/i18n/format'
import type { Language } from '@/i18n/resources'

const stepKey = {
  add: 'chat.stepAdd',
  move: 'chat.stepMove',
  update: 'chat.stepUpdate',
  remove: 'chat.stepRemove',
} as const satisfies Record<StepKind, string>

/** A step in plain words, never the tool behind it, for the line and the live region. */
export function stepText(step: TurnStep, t: TFunction, language: Language) {
  return t(stepKey[step.kind], {
    title: step.title,
    time: formatTime(step.time, language),
    date: formatCardDate(step.date, language),
  })
}
