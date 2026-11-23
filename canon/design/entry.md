---
title: Entry
description: One calendar entry, with its detail, the add and edit sheets, and the delete confirmation
---

# Entry

Row v01.3 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/features/entries/entry-detail.tsx`: the detail on the kind's pastel, with who added and last changed it
- `src/features/entries/entry-form.tsx`: the add and edit form, with Kind optional and the cost in the trip currency
- `src/components/delete-sheet.tsx`: the delete confirmation, opened from the detail, the edit form, and the swiped row
- `src/components/kind-icons.tsx`: the five drawn kind icons
- `src/components/save-error.tsx`: the save error from `states/`, on the card fill rather than the frame's pink
- `src/components/undo-status.tsx`: the status naming each save or delete with its Undo
- `src/components/sheet-list.tsx`: the Starts and How long choices, opened as a sheet list
- `src/features/entries/lengths.ts`: the start times, the six lengths, and an entry's own length as a seventh
- `src/components/swipe-row.tsx`: the swiped Delete that opens the delete confirmation through its caller

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Detail, add, edit, and delete
- The sheet list open on Starts, as a bottom sheet on phone and a dialog from tablet up
