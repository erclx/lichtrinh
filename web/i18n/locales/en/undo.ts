export const undo = {
  created: 'Created “{{title}}”',
  added: 'Added “{{title}}”',
  saved: 'Saved “{{title}}”',
  deleted: 'Deleted “{{title}}”',
  undo: 'Undo',
  undoing: 'Undoing…',
  undone: 'Undone',
  conflict: "Can't undo, since someone changed it after.",
  outsideDates:
    "Can't undo, since an activity would fall outside the trip's dates.",
  otherCurrency: "Can't undo, since the costs are in another currency now.",
  alreadyUndone: 'That was already undone.',
  dismiss: 'Dismiss',
} as const
