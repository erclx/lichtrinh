import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { chatKeys, readStatus, warm } from '@/features/chat/chat-api'

const statusMs = 30_000

/**
 * Whether the workspace PC and its voice answer, read every 30 seconds while
 * visible, warming the model on the first online read. Each is null unread.
 */
export function useAssistantStatus(): {
  online: boolean | null
  voiceOnline: boolean | null
} {
  const status = useQuery({
    queryKey: chatKeys.status(),
    queryFn: readStatus,
    refetchInterval: statusMs,
    refetchIntervalInBackground: false,
  })
  const online = status.data?.online ?? null
  const warmed = useRef(false)

  // Offline, warm answers 503, which the browser logs however it is caught.
  useEffect(() => {
    if (online !== true || warmed.current) return
    warmed.current = true
    warm().catch(() => undefined)
  }, [online])

  return { online, voiceOnline: status.data?.voice?.online ?? null }
}
