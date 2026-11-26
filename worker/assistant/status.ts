import type { AssistantStatus } from '@shared/assistant.ts'

import type { Db } from '../calendar/record.ts'
import { readVoiceModel } from '../voice/model.ts'
import { lastAnsweredAt } from './chats.ts'
import { readModel } from './model.ts'
import { relayOf } from './relay.ts'

/** Whether the assistant and voice can answer now. */
export async function readAssistantStatus(
  env: Env,
  db: Db,
): Promise<AssistantStatus> {
  const relay = relayOf(env)
  const [online, answeredAt, model, voiceOnline, voiceModel] =
    await Promise.all([
      relay.online(),
      lastAnsweredAt(db),
      readModel(db),
      relay.voiceOnline(),
      readVoiceModel(db),
    ])
  return {
    online,
    lastAnsweredAt: answeredAt?.toISOString() ?? null,
    model,
    voice: { online: voiceOnline, model: voiceModel },
  }
}
