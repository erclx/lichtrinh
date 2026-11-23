---
title: Today
description: The day view the app opens on, showing what is happening now, what comes next, and the day's estimated cost
---

# Today

Row v01.3 builds this screen. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/features/day/swipe-row.tsx`: the left swipe on a day row that reveals Delete under 1024px
- `src/components/sheet-list.tsx` and `src/components/date-range-sheet.tsx`: the choices and the trip dates the prototype opens

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The clickable prototype, the interaction reference for the day, the entry sheets, the chat, and Talk
- The day view composition, at 1440 and 390 wide
