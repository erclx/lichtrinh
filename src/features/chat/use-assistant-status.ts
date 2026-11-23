import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { chatKeys, readStatus, warm } from '@/features/chat/chat-api'

const statusMs = 30_000

/**
 * Whether the workspace PC can answer, read on open and every 30 seconds
 * while the page is visible, and asked to load the model once on open so
 * the first reply comes sooner. Null until the first read lands.
 */
export function useAssistantStatus(): { online: boolean | null } {
  const status = useQuery({
    queryKey: chatKeys.status(),
    queryFn: readStatus,
    refetchInterval: statusMs,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    // Warming is a head start, so a refusal here changes nothing shown.
    warm().catch(() => undefined)
  }, [])

  return { online: status.data?.online ?? null }
}
