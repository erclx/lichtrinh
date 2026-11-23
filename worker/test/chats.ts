import type { ChatEvent } from '@shared/chats.ts'
import { chatEvent, chatRead } from '@shared/chats.ts'
import type { VoiceSend } from '@shared/voice.ts'
import { env } from 'cloudflare:workers'

import { app } from '../app.ts'
import { json } from './requests.ts'
import { addTrip } from './trips.ts'
import { signedIn } from './users.ts'

/** A chatting account with a chat bound to an invented trip of its own. */
export async function chatterWithChat() {
  const signed = await signedIn({ canChat: true })
  const { trip } = await addTrip(signed.cookie)
  const res = await app.request(
    '/api/chats',
    json('POST', { id: crypto.randomUUID() }, signed.cookie),
    env,
  )
  if (res.status !== 201) throw new Error(`Chat create answered ${res.status}`)
  const { chat } = chatRead.parse(await res.json())
  return { ...signed, trip, chat }
}

export function sendMessage(
  cookie: string,
  chatId: string,
  body: { id?: string; text?: string; voice?: VoiceSend } = {},
) {
  return app.request(
    `/api/chats/${chatId}/messages`,
    json(
      'POST',
      {
        id: body.id ?? crypto.randomUUID(),
        text: body.text ?? 'Invented ask',
        ...(body.voice === undefined ? {} : { voice: body.voice }),
      },
      cookie,
    ),
    env,
  )
}

/** Reads a send's NDJSON stream to its end. */
export async function readEvents(res: Response): Promise<ChatEvent[]> {
  const text = await res.text()
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => chatEvent.parse(JSON.parse(line)))
}
