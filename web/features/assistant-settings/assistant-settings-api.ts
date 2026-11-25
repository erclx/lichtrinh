import {
  type AssistantModel,
  assistantSettings,
  assistantStatus,
} from '@shared/assistant.ts'
import {
  type NoticeEmailWrite,
  noticeSetting,
  type PushDevice,
} from '@shared/notices.ts'
import { contactSettings } from '@shared/settings.ts'
import { voiceAdmin, type VoiceModel, voiceSettings } from '@shared/voice.ts'

import { ApiFailure, apiFetch } from '@/lib/api'

/** The line any failed call on this page shows. */
export function failureKey(error: unknown) {
  return error instanceof ApiFailure && error.code === 'network'
    ? 'errors.network'
    : 'errors.generic'
}

/** The speech model the admin picked, with how each model did in use. */
export function readVoice() {
  return apiFetch('/admin/voice', { schema: voiceAdmin })
}

export async function saveVoiceModel(model: VoiceModel) {
  const saved = await apiFetch('/admin/voice', {
    method: 'PUT',
    body: { model },
    schema: voiceSettings,
  })
  return saved.model
}

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

export function readNoticeSetting() {
  return apiFetch('/admin/notices', { schema: noticeSetting })
}

/** Turns push on for this session's device. */
export function savePushDevice(device: PushDevice) {
  return apiFetch('/admin/notices/device', {
    method: 'PUT',
    body: device,
    schema: noticeSetting,
  })
}

export function turnPushOff() {
  return apiFetch('/admin/notices/device', {
    method: 'DELETE',
    schema: noticeSetting,
  })
}

/** Sends the address a test, and keeps it only once the test was taken. */
export function saveNoticeEmail(write: NoticeEmailWrite) {
  return apiFetch('/admin/notices/email', {
    method: 'PUT',
    body: write,
    schema: noticeSetting,
  })
}

export function turnEmailOff() {
  return apiFetch('/admin/notices/email', {
    method: 'DELETE',
    schema: noticeSetting,
  })
}
