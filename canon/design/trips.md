---
title: Trips
description: The trip list, one trip's overview, creating a trip, and the week and month calendars
---

# Trips

Row v01.3 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

English dates follow `Intl` in the build, as 9/20, 9/20/2031, and Mon to Sun, where the English frames draw 20/9, 20/9/2031, and Mo to Su.

## Code

- `src/components/date-range-sheet.tsx`: the Trip dates range sheet setting From and To together
- `src/components/sheet-list.tsx`: the local time and currency choices
- `src/lib/month-cells.ts`: the Monday-first month the range sheet and the calendar both lay out

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- The list, an overview, and the create sheet
- The create sheet with the Trip dates range sheet open
- The week and month calendars
