---
title: Entry
description: One calendar entry, with its detail, the add and edit sheets, and the delete confirmation
---

# Entry

Row v01.3 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/components/sheet-list.tsx`: the Starts and How long choices, opened as a sheet list
- `src/features/entries/lengths.ts`: the start times, the six lengths, and an entry's own length as a seventh
- `src/features/day/swipe-row.tsx`: the swiped Delete that opens the delete confirmation through its caller

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Detail, add, edit, and delete
- The sheet list open on Starts, as a bottom sheet on phone and a dialog from tablet up
