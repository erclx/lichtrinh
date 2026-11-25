import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { sendEmail } from './email.ts'

const WORDS = { subject: 'Invented subject', text: 'Invented text' }

describe('sendEmail', () => {
  it('gives up on a send that never settles', async () => {
    const hanging: Env = {
      ...env,
      EMAIL: { send: () => new Promise(() => undefined) },
    }

    const outcome = await sendEmail(hanging, 'admin@example.com', WORDS, 20)

    expect(outcome).toBe('failed')
  })
})
