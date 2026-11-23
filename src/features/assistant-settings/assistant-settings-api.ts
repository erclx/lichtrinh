import {
  type AssistantModel,
  assistantSettings,
  assistantStatus,
} from '@shared/assistant.ts'
import { contactSettings } from '@shared/settings.ts'

import { apiFetch } from '@/lib/api'

export function readAssistantStatus() {
  return apiFetch('/assistant/status', { schema: assistantStatus })
}

export async function saveModel(model: AssistantModel) {
  const saved = await apiFetch('/admin/assistant', {
    method: 'PUT',
    body: { model },
    schema: assistantSettings,
  })
  return saved.model
}

export async function readContact() {
  const { contactName } = await apiFetch('/settings', {
    schema: contactSettings,
  })
  return contactName
}

/** Null clears the name, and the offline card falls back to the admin. */
export async function saveContact(contactName: string | null) {
  const saved = await apiFetch('/admin/settings', {
    method: 'PUT',
    body: { contactName },
    schema: contactSettings,
  })
  return saved.contactName
}
