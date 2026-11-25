import type { Change } from '@shared/changes.ts'
import { useRef, useState } from 'react'

import { useUndo } from '@/calendar-data/mutations'
import { ApiFailure } from '@/lib/api'

export type UndoOutcome =
  | 'ready'
  | 'undone'
  | 'alreadyUndone'
  | 'conflict'
  | 'network'
  | 'failed'

function outcomeOf(error: unknown): UndoOutcome {
  if (!(error instanceof ApiFailure)) return 'failed'
  if (error.code === 'already_undone') return 'alreadyUndone'
  if (error.code === 'undo_conflict') return 'conflict'
  if (error.code === 'network') return 'network'
  return 'failed'
}

/**
 * One change's Undo. The undo id is made once per change shown, so a press
 * retried after a lost answer reaches the undo the first press stored
 * rather than undoing twice.
 */
export function useChangeUndo(
  change: Change,
  onUndone?: (undo: Change) => void,
) {
  const undo = useUndo()
  const [undoId] = useState(() => crypto.randomUUID())
  const [pressed, setPressed] = useState<UndoOutcome>('ready')
  // A second tap can land before the pending flag renders.
  const sending = useRef(false)

  const outcome: UndoOutcome =
    change.undoneBy !== null && pressed !== 'alreadyUndone' ? 'undone' : pressed

  function run() {
    if (sending.current) return
    if (outcome === 'undone' || outcome === 'alreadyUndone') return
    sending.current = true
    undo.mutate(
      { changeId: change.id, undoId },
      {
        onSuccess: (answer) => {
          setPressed('undone')
          onUndone?.(answer.change)
        },
        onError: (error) => setPressed(outcomeOf(error)),
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  return { outcome, isPending: undo.isPending, run }
}
