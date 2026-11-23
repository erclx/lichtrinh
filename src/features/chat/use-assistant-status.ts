import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { chatKeys, readStatus, warm } from '@/features/chat/chat-api'

const statusMs = 30_000

/**
 * Whether the workspace PC can answer, read on open and every 30 seconds
 * while the page is visible, and asked once to load the model when it first
 * reads online. Null until the first read lands.
 */
export function useAssistantStatus(): { online: boolean | null } {
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

  return { online }
}
