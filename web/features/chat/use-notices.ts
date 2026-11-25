import {
  type NoticeKind,
  type NoticeState,
  noticeState,
  sentNotice,
} from '@shared/notices.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { refreshMs } from '@/calendar-data/query-client'
import { chatKeys } from '@/features/chat/chat-api'
import { apiFetch } from '@/lib/api'

const noticesKey = [...chatKeys.all, 'notices'] as const

function readNotices() {
  return apiFetch('/notices', { schema: noticeState })
}

/** Takes the kind alone, since an outage's notice is sent once whoever asks. */
function sendNotice(kind: NoticeKind) {
  return apiFetch('/notices', {
    method: 'POST',
    body: { kind },
    schema: sentNotice,
  })
}

/**
 * The notice of the outage under way and the send, for an offline card. The
 * read is dropped with the card, so the next outage never opens on the last
 * one's notice.
 */
export function useNotices(kind: NoticeKind) {
  const client = useQueryClient()
  const state = useQuery({
    queryKey: noticesKey,
    queryFn: readNotices,
    refetchInterval: refreshMs,
    gcTime: 0,
  })
  const send = useMutation({
    mutationFn: () => sendNotice(kind),
    onSuccess: async (notice) => {
      // A poll that left before the send would read it as unsent.
      await client.cancelQueries({ queryKey: noticesKey })
      client.setQueryData<NoticeState>(noticesKey, (read) =>
        read === undefined ? read : { ...read, [kind]: notice },
      )
    },
    // The service may be back, which the status read shows by itself.
    onError: () =>
      void client.invalidateQueries({ queryKey: chatKeys.status() }),
  })
  return {
    /** Undefined until read, with `unread` once the read has failed. */
    reachable: state.data?.reachable,
    notice: state.data?.[kind] ?? null,
    unread: state.isError && state.data === undefined,
    send,
  }
}
