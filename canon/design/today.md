---
title: Today
description: The day view the app opens on, showing what is happening now, what comes next, and the day's estimated cost
---

# Today

Row v01.3 builds this screen. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `web/features/today/today-screen.tsx`: the home screen, the day under way or the next trip's card
- `web/shell/page-header.tsx`: the title row, which holds Today's Add beside the date
- `web/features/day/day-view.tsx`: the day's date with Add, the trip and day number, the estimated cost, and the strip of days
- `web/components/day-list.tsx`: the one list, with done rows collapsed and the now card expanded, leaving out the side column past 1000px
- `web/components/swipe-row.tsx`: the left swipe on a day row that reveals Delete under 1024px

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- Now, the next trip, and the day page
