---
title: Shell
description: The frame around every screen, being the desktop nav and docked chat, the tablet rail and Talk bar, and the phone tabs
---

# Shell

Row v02.1 builds the shell. These frames are a reference, and where that row's plan differs from a frame, the plan wins.

## Code

- `src/shell/app-shell.tsx`: the frame, its breakpoints, the gutters, and the `main` landmark
- `src/shell/nav.tsx`: the desktop sidebar and its hide toggle, the tablet rail, and the phone tabs
- `src/shell/top-bar.tsx`: the wordmark, the language toggle, and the Settings button
- `src/shell/destinations.ts` and `src/shell/icons.tsx`: the places the nav links to and their drawn icons
- `src/shell/page-header.tsx`: the back control and the page heading every page renders

## States

- Desktop at 1440, tablet at 834, and phone at 390 wide
- The portrait tablet Talk bar, closed and with the chat sheet open
- Light and dark
