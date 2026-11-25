import type { Change } from '@shared/changes.ts'
import { useRef, useState } from 'react'

import { useUndo } from '@/calendar-data/mutations'
import { ApiFailure } from '@/lib/api'

export type UndoOutcome =
  | 'ready'
  | 'undone'
  | 'alreadyUndone'
  | 'conflict'
  | 'outsideDates'
  | 'otherCurrency'
  | 'network'
  | 'failed'

function outcomeOf(error: unknown): UndoOutcome {
  if (!(error instanceof ApiFailure)) return 'failed'
  if (error.code === 'already_undone') return 'alreadyUndone'
  if (error.code === 'undo_conflict') return 'conflict'
  if (error.code === 'entries_outside_range') return 'outsideDates'
  if (error.code === 'currency_has_costs') return 'otherCurrency'
  if (error.code === 'network') return 'network'
  return 'failed'
}

interface Options {
  onUndone?: (undo: Change) => void
  /**
   * The entity's newest change when it left the state this one did, so the
   * server would take an undo of it. A conflict drops when a new one appears.
   */
  restoredBy?: string
}

interface Press {
  outcome: UndoOutcome
  restoredBy?: string
}

/**
 * One change's Undo. The undo id is made once per change shown, so a press
 * retried after a lost answer reaches the undo the first press stored
 * rather than undoing twice.
 */
export function useChangeUndo(
  change: Change,
  { onUndone, restoredBy }: Options = {},
) {
  const undo = useUndo()
  const [undoId] = useState(() => crypto.randomUUID())
  const [press, setPress] = useState<Press>({ outcome: 'ready' })
  // A second tap can land before the pending flag renders.
  const sending = useRef(false)

  function read(): UndoOutcome {
    if (press.outcome === 'alreadyUndone') return 'alreadyUndone'
    if (change.undoneBy !== null) return 'undone'
    const restored = restoredBy !== undefined && restoredBy !== press.restoredBy
    return press.outcome === 'conflict' && restored ? 'ready' : press.outcome
  }
  const outcome = read()

  function run() {
    if (sending.current) return
    if (outcome === 'undone' || outcome === 'alreadyUndone') return
    sending.current = true
    undo.mutate(
      { changeId: change.id, undoId },
      {
        onSuccess: (answer) => {
          setPress({ outcome: 'undone' })
          onUndone?.(answer.change)
        },
        onError: (error) => setPress({ outcome: outcomeOf(error), restoredBy }),
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  return { outcome, isPending: undo.isPending, run }
}
