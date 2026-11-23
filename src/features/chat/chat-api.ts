import { assistantStatus } from '@shared/assistant.ts'
import { chatList, chatRead, chatThread } from '@shared/chats.ts'
import { contactSettings } from '@shared/settings.ts'
import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

const segment = encodeURIComponent

/** Every chat read's key, named once so a send refreshes the right ones. */
export const chatKeys = {
  all: ['chat'] as const,
  list: () => ['chat', 'list'] as const,
  thread: (id: string) => ['chat', 'thread', id] as const,
  status: () => ['chat', 'status'] as const,
  contact: () => ['chat', 'contact'] as const,
}

export async function listChats() {
  const { chats } = await apiFetch('/chats', { schema: chatList })
  return chats
}

/** Takes the id from the caller, so a retry after a lost answer adds no second. */
export async function createChat(id: string) {
  const { chat } = await apiFetch('/chats', {
    method: 'POST',
    body: { id },
    schema: chatRead,
  })
  return chat
}

export function readThread(id: string) {
  return apiFetch(`/chats/${segment(id)}`, { schema: chatThread })
}

export function readStatus() {
  return apiFetch('/assistant/status', { schema: assistantStatus })
}

/** Asks the workspace PC to load the model ahead of the first send. */
export function warm() {
  return apiFetch('/assistant/warm', { method: 'POST' })
}

/** The name the offline card asks the traveler to contact, or null for the admin. */
export async function readContact() {
  const { contactName } = await apiFetch('/settings', {
    schema: contactSettings,
  })
  return contactName
}

export function useChats() {
  return useQuery({ queryKey: chatKeys.list(), queryFn: listChats })
}

export function useThread(id: string) {
  return useQuery({
    queryKey: chatKeys.thread(id),
    queryFn: () => readThread(id),
  })
}

export function useContact() {
  return useQuery({ queryKey: chatKeys.contact(), queryFn: readContact })
}
