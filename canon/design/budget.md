---
title: Budget
description: A trip's estimated cost and the history of what changed it
---

# Budget

Row v01.7 builds the trip screens and v03.5 the history ones. These frames are a reference, and where a row's plan differs from a frame, the plan wins.

## Code

- `web/features/budget/budget-page.tsx`: the trip frames, being the total with its home figure, the kind bar and legend, and By day
- `web/components/home-estimate.tsx`: the "about" figure beside the total, read by the overview and the day view too
- `web/features/changes/history-page.tsx`: the history frames, with the marks in the muted fill rather than the frames' pastels, since a pastel names a kind alone

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide, in light and dark
- A trip's budget and its history
