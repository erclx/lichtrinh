import { assistantStatus } from '@shared/assistant.ts'
import { chatList, chatRead, chatThread } from '@shared/chats.ts'
import { contactSettings } from '@shared/settings.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { refreshMs } from '@/calendar-data/query-client'
import { isReplySaved } from '@/features/chat/turn'
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

/** The account's chats, most recently active first, whichever order arrives. */
export async function listChats() {
  const { chats } = await apiFetch('/chats', { schema: chatList })
  return chats.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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

const savingMs = 1_000

/**
 * One chat, asked again every second while `unsavedSend` names a send whose
 * reply the API is still saving after a Stop or a drop, so its cards arrive
 * without the usual 30 second wait.
 */
export function useThread(id: string, unsavedSend: string | null = null) {
  return useQuery({
    queryKey: chatKeys.thread(id),
    queryFn: () => readThread(id),
    refetchInterval: ({ state }) =>
      unsavedSend !== null &&
      !isReplySaved(state.data?.messages ?? [], unsavedSend)
        ? savingMs
        : refreshMs,
  })
}

/**
 * Starts a chat under an id kept until it lands, so a press retried after
 * a lost answer reaches the chat the first press made.
 */
export function useStartChat() {
  const client = useQueryClient()
  const [id, setId] = useState(() => crypto.randomUUID())
  return useMutation({
    mutationFn: () => createChat(id),
    onSuccess: () => {
      setId(crypto.randomUUID())
      void client.invalidateQueries({ queryKey: chatKeys.list() })
    },
  })
}

/**
 * The chat the Talk bar and the dock open: the most recent one, or a new
 * one when the account has none, per the plan's first question.
 */
export function useOpenLatestChat() {
  const client = useQueryClient()
  const start = useStartChat()
  const open = async (): Promise<string> => {
    const [latest] = await client.fetchQuery({
      queryKey: chatKeys.list(),
      queryFn: listChats,
    })
    return latest?.id ?? (await start.mutateAsync()).id
  }
  return { open, start }
}

export function useContact() {
  return useQuery({ queryKey: chatKeys.contact(), queryFn: readContact })
}
