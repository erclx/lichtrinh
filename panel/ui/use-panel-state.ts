import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { actionDone, panelState } from '../state.ts'
import type { Press } from './copy.ts'

const READ_EVERY_MS = 3_000

async function readState(signal: AbortSignal) {
  const response = await fetch('/api/state', { signal })
  if (!response.ok) throw new Error(`The panel answered ${response.status}`)
  return panelState.parse(await response.json())
}

async function send(press: Press) {
  const path =
    press.on === 'all'
      ? `/api/all/${press.action}`
      : `/api/services/${press.id}/${press.action}`
  const response = await fetch(path, { method: 'POST' })
  if (!response.ok) throw new Error(`The panel answered ${response.status}`)
  actionDone.parse(await response.json())
}

/**
 * The machine's state, read every three seconds while the page is visible and
 * again after each press. The last good read stays while a later one fails.
 */
export function usePanelState() {
  const [pending, setPending] = useState<readonly Press[]>([])
  const [failure, setFailure] = useState<Press | null>(null)
  const { data, isError, refetch } = useQuery({
    queryKey: ['panel-state'],
    queryFn: ({ signal }) => readState(signal),
    refetchInterval: READ_EVERY_MS,
    // The server is on this machine, so a dropped network hides nothing.
    networkMode: 'always',
    retry: false,
  })

  async function press(next: Press) {
    setFailure(null)
    setPending((presses) => [...presses, next])
    try {
      await send(next)
    } catch {
      setFailure(next)
    } finally {
      setPending((presses) => presses.filter((one) => one !== next))
      await refetch()
    }
  }

  return { state: data, stale: isError, pending, failure, press }
}
