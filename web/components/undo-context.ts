import { createContext, useContext } from 'react'

/** Offers Undo for a change, naming it in `message`, such as `Deleted “Lunch”`. */
export type OfferUndo = (message: string, changeId: string) => void

export const OfferUndoContext = createContext<OfferUndo | null>(null)

/** The offer a page calls after a save or a delete, from `UndoProvider`. */
export function useOfferUndo(): OfferUndo {
  const offer = useContext(OfferUndoContext)
  if (offer === null) {
    throw new Error('useOfferUndo needs an UndoProvider above it')
  }
  return offer
}
