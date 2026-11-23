---
title: Budget
description: A trip's estimated cost and the history of what changed it
---

# Budget

Row v01.7 builds these screens. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/features/budget/budget-page.tsx`: the trip frames, being the total with its home figure, the kind bar and legend, and By day
- `src/components/home-estimate.tsx`: the "about" figure beside the total, read by the overview and the day view too
- The history frames have no code yet, and their row names the paths

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- A trip's budget and its history
