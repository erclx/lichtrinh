import type { EmailWords } from '@shared/notice-text.ts'

import { logOutcome } from '../log.ts'

const TIMEOUT_MS = 5_000

// The free plan sends to addresses confirmed in the Cloudflare account alone,
// so either refusal means the owner has yet to confirm this one.
const UNCONFIRMED = new Set([
  'E_RECIPIENT_PLAN_RESTRICTED',
  'E_RECIPIENT_NOT_ALLOWED',
])

export type EmailOutcome = 'sent' | 'unconfirmed' | 'failed'

/** Whether this copy has a sender, without which email is off altogether. */
export function canEmail(env: Env): boolean {
  return Boolean(env.NOTICE_FROM)
}

/**
 * Sends one plain text email. Any refusal is an outcome, never a throw, so a
 * sending domain not set up yet reads as a failed send.
 */
export async function sendEmail(
  env: Env,
  to: string,
  words: EmailWords,
): Promise<EmailOutcome> {
  const from = env.NOTICE_FROM
  if (!from) return 'failed'
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)
  })
  try {
    await Promise.race([
      env.EMAIL.send({
        to,
        from: { email: from, name: 'Lịch trình' },
        ...words,
      }),
      late,
    ])
    return 'sent'
  } catch (error) {
    const code = refusalCode(error)
    logOutcome(`email_refused_${code ?? 'unknown'}`)
    return code !== null && UNCONFIRMED.has(code) ? 'unconfirmed' : 'failed'
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

// Only a code's own shape passes, so no text a provider wrote, which can hold
// the address, reaches a log.
function refusalCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  const { code } = error
  return typeof code === 'string' && /^E_[A-Z_]+$/.test(code) ? code : null
}
